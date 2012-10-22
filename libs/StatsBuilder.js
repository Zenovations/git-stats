
var
   Q          = require('q'),
   _          = require('underscore'),
   GitHubWrap = require('./github.js'),
   fxns       = require('./fxns.js'),
   moment     = require('moment'),
   logger     = fxns.logger();

function StatsBuilder(conf) {
   this.gh    = new GitHubWrap(conf.user, conf.pass);
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.trends.intervals);
   this.cache = fxns.readCache(conf.cache_file) || { lastUpdate: moment.utc().subtract('years', 100).format(), stats: { orgs: [], repos: {} }, trends: { total: {}, repos: {}, latest: {} } };
   if( conf.trends.active ) {
      this.cache.trends.total = buildTrends(conf.trends, this.cache.trends.total);
      if( conf.trends.repos ) {
         this.cache.trends.repos = {};
      }
   }

//   logger.log(util.inspect(this.cache.stats, false, 5, true));
//   logger.log(util.inspect(this.cache.trends, false, 5, true));
   var promises = [];
   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises)
      .then(_.bind(function() {
         return this;
      }, this))
      .fail(_.bind(function(e) {
         if( _.isObject(e) && e.code == 403 && e.message.indexOf('Rate Limit Exceeded') > -1 ) {
            // if the rate limit is exceeded, we'll get interrupted right in the middle of collecting fun stuff
            // so what we're going to do here is wait for all the outstanding activities to be resolved, then we're
            // going to cache whatever we've managed to collect and call it happy
            logger.warn('Rate Limit Exceeded; results may be incomplete');
            return this;
         }
         else {
            throw e;
         }
      }, this))
      .fin(_.bind(function() {
         //debug
//         fxns.cache(this.cache, conf.cache_file);
      }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   var promises = [];
   if( !this.conf.orgFilter || this.conf.orgFilter(org, this.conf) ) {
      logger.info('ORG', org.login, org);
      var orgs = this.cache.stats.orgs, orgEntry = {name: org.login, url: org.url};
      if(_.indexOf(orgs, orgEntry) < 0 ) {
         this.cache.stats.orgs.push(orgEntry);
      }
      promises.push( this.gh.repos(org.login, _.bind(this.addRepo, this)) );
   }
   return Q.when(promises);
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, def = Q.resolve(null);
   if( !conf.repoFilter || conf.repoFilter(data) ) {
      var repoName = data.full_name, hasUpdates = true;

      var cache = this.cache;
      if( conf.trends.active && conf.trends.repos ) {
         // set up the trends entries, we don't use any cached data because the keys change based on when this runs
         // so build the keys from scratch and then apply cache to any matching keys
         cache.trends.repos[repoName] = buildTrends(conf.trends, cache.trends.repos[repoName]);
      }

      if( !cache.stats.repos[repoName] ) {
         // the repo doesn't exist in our cache, so we need to load initial stats data
         var repo = _.extend(mapRepoData(data), {
            latestRead: null,  // the most recent read, used for determining when we've hit already loaded data
            lastRead: null,    // when this is not null, we are in the middle of a run (e.g. the last run aborted)
            stats: {}
         });
         logger.info('INIT', repoName, repo.updated);//debug
      }
      else {
         // repo already exists
         repo = cache.stats.repos[repoName];

         // check to see if the repo was updated or aborted (is there anything to modify?)
         hasUpdates = repo.lastRead || moment(data.updated_at).diff(moment(repo.updated)) > 0;

         // now update the cached version with any changes to the repo meta data
         _.extend(repo, mapRepoData(data));

         logger.info(!hasUpdates? 'NOCHANGE' : (repo.lastRead? 'CONTINUE' : 'UPDATE'), repoName, repo.updated);
      }

      cache.stats.repos[repoName] = repo;

      // update repo level stats
      _.extend(repo.stats, {
         watchers: data.watchers,
         issues: data.open_issues,
         forks: data.forks
      });

      // build any keys that don't exist yet
      _.each(conf.static, function(v, k) {
         if( v && !_.has(repo.stats, k) ) {
            repo.stats[k] = 0;
         }
      });

      // accumulate the same stats into trends as appropriate
      _.each(['watchers', 'issues', 'forks'], function(statName) {
         incrementTrends(cache.trends, conf.trends, repoName, statName);
      });
      //todo
      //todo
      //todo

      if( hasUpdates ) {
         def = def.then(_.bind(function() {
            return this.gh.commits(repo.owner, repo.name, _.bind(this.addCommit, this), repo.lastRead);
         }, this));
      }
      else {
         def = Q.resolve();
      }

      def = def.then(function() {
         // mark our repo completely updated
         repo.lastRead = null;

         // store the latest read so that on future updates we only have to read commits which we haven't read before
         // in the case that a commit fails, we don't update this; the next time this repo is updated we will start
         // reading from repo.lastRead and continue to the same target we aimed for last time (the prior repo.latestRead)
         repo.latestRead = _latestRead(def) || repo.latestRead;

         return repo;
      });
   }
   return def;
};

StatsBuilder.prototype.addCommit = function(commit, owner, repoName) {
   var fullRepoName = _repoName(owner, repoName),
       repo = this.cache.stats.repos[fullRepoName],
       when = moment(commit.committer.date).utc(),
       def = Q.defer();


   if( repo.latestRead == commit.sha  ) {
      //we've found the last point at which commits were read successfully, so we can stop reading commits
      return false;
   }

   if( needsCommitDetails(this.conf) ) {
      logger.debug('fetching commit details', fullRepoName, commit.sha);
      // if we need additional details for stats, fetch them before resolving
      this.gh.commit(owner, repoName, commit.sha)
         .then(function(detail) {
            def.resolve([commit, detail]);
         }, def.reject);
   }
   else {
      // if there are no details to fetch, resolve instantly
      def.resolve(commit);
   }

   // A commit is all or nothing.
   //
   // We wait for full resolution before adding this commit to the stats. In this way if
   // the operation fails, we have not added partial stats that will corrupt the results
   return def.promise.then(
      _.bind(function(commit) {
         var commitDetail;
         if(_.isArray(commit)) {
            commitDetail = commit[1];
            commit = commit[0];
         }
         logger.info('  C', fullRepoName, commit.sha);
         if( commitDetail ) {
            logger.info('  CC', commitDetail.sha);
            //todo
            //todo
            //todo
            //todo
         }

         if( this.conf.static.commits ) {
            repo.stats.commits++;
         }
         incrementTrends(this.cache.trends, this.conf.trends, fullRepoName, 'commits', when);

         // each successful read is stored by key so if we abort or fail before completing the repo, we know where to start again
         repo.lastRead = commit.sha;

         return commit;
      }, this)
   );
};

StatsBuilder.prototype.getTrends = function(format, compress) {
   var data = format=='xml'? fxns.prepTrendsForXml(this.cache.trends) : this.cache.trends;
   //todo doesn't work for csv yet :(
   return fxns.format(format, compress, data);
};

StatsBuilder.prototype.getStats = function(format, compress) {
   var data = format=='xml'? fxns.prepStatsForXml(this.cache.stats) : this.cache.stats;
   return fxns.format(format, compress, data);
};

exports.load = function(conf) {
   return new StatsBuilder(conf).promise;
};

function averageTrends(trends, trendConf, repoName, statKey, when, amt) {
   //todo
   //todo
   //todo
   //todo
}

function incrementTrends(trends, trendConf, repoName, statKey, when, amt) {
   amt || (amt = 1);
   when || (when = moment.utc());
   logger.debug('incrementTrends', statKey, trendConf.collect[statKey]);
   if( trendConf.active && trendConf.collect[statKey] ) {
      //todo handle averages
      //todo
      //todo
      //todo
      //todo
      _incTrend(trendConf.intervals, trends.total[statKey], when, amt);
      if( trendConf.repos ) {
         _incTrend(trendConf.intervals, trends.repos[repoName][statKey], when, amt);
      }
   }
}

function _incTrend(intervals, trend, when, amt) {
   _.each(intervals, function(v, k) {
      if( v ) {
         var key = fxns.intervalKey(when, k);
         logger.debug('_incTrend', k, key);
         if( _.has(trend, key) ) {
            trend[key] += ~~amt;
         }
      }
   });
}

function buildTrends(conf, cache) {
   cache || (cache = {});
   var intervals = conf.intervals, out = {};
   _.each(conf.collect, function(v, k) {
      if( !v ) { return; }
      out[k] = _trendIntervals(intervals, cache[k]);
   });
   return out;
}

function _trendIntervals(intervals, cached) {
   var out = {};
   _.each(intervals, function(v, k) {
      out[k] = _interval(k, v, cached);
   });
   return out;
}

function _interval(units, span, cached) {
   var out = [], cache = cacheForTrend(cached, units), i = span;
   while(i--) {
      var d = moment.utc();
      if( i > 0 ) { d.subtract(units, i); }
      var ds = fxns.intervalKey(d, units);
      out.push([ds, cache[ds] || 0]);
   }
   return out;
}

function cacheForTrend(trendSet, units) {
   var t = trendSet && trendSet[units];
   return t? _.object(t) : {};
}

function _buildFileFilters(lastUpdate, conf) {
   var out = { since: lastUpdate };
   _.each(['fileFilter', 'dirFilter'], function(v) {
      if( conf[v] ) {
         out[v] = conf[v];
      }
   });
   return out;
}

function _repoName(owner, repo) {
   return owner+'/'+repo;
}

function needsCommitDetails(conf) {
   var list = ['lines', 'bytes', 'adds', 'deletes'];
   function _check(v, k) {
      return v && _.indexOf(list, k) >= 0;
   }
   return _.any(conf.static, _check) || _.any(conf.trends.collect, _check);
}

function mapRepoData(data) {
   return {
      name: data.name,
      fullName: data.full_name,
      size: data.size,
      created: data.created_at,
      updated: data.updated_at,
      description: data.description,
      homepage: data.homepage,
      url: data.html_url,
      owner: data.owner.login || data.owner.name
   };
}

function _latestRead(commitPromises) {
   var i = commitPromises.length;
   while(i--) {
      if(commitPromises[i].isFulfilled()) {
         return commitPromises[i].valueOf();
      }
   }
   return null;
}