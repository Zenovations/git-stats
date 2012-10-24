
var
   Q          = require('q'),
   _          = require('underscore'),
   fxns       = require('./fxns.js'),
   GitHubWrap = require('./github.js'),
   moment     = require('moment'),
   logger     = fxns.logger(),
   util       = require('util'),
   REQUIRES_DETAIL = ['files', 'lines', 'bytes', 'adds', 'deletes'],
   undef;

/**
 * @param {object} conf
 * @constructor
 */
function StatsBuilder(conf) {
   this.gh    = new GitHubWrap(conf.user, conf.pass);
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.trends.intervals);
   this.cache = fxns.readCache(conf);
   initStatSet(this.cache.stats.total, conf.static);
   _initTrends(this.cache.trends, conf);

   // temporary state info used internally to connect the methods together without too much coupling
   this.tmp = {
      firstCommits: {}
   };

//   logger.log(util.debug(this.cache.stats, false, 5, true));
//   logger.log(util.debug(this.cache.trends, false, 5, true));
   var promises = [];
   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises)
      .then(_.bind(function() {
         //todo build averages
         //todo
         //todo
         //todo
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
         conf.trends.active && conf.trends.averages && calculateAverages(this.cache, this.conf.trends);
         //fxns.cache(this.cache, conf); //todo
      }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   var promises = [];
   if( !this.conf.filters.org || this.conf.filters.org(org, this.conf) ) {
      logger.info('ORG', org.login);
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
   if( !conf.filters.repo || conf.filters.repo(data) ) {
      var repoName = data.full_name, hasUpdates = true, status = 'NOCHANGE';

      var cache = this.cache;
      if( conf.trends.active && conf.trends.repos ) {
         // set up the trends entries, we don't use any cached data because the keys change based on when this runs
         // so build the keys from scratch and then apply cache to any matching keys
         cache.trends.repos[repoName] = buildTrends(conf.trends, cache.trends.repos[repoName]);
      }

      if( !cache.stats.repos[repoName] ) {
         // the repo doesn't exist in our cache, so we need to load initial stats data
         var repo = _.extend(mapRepoData(data), {
            //todo rename to firstCommit
            latestRead: null,  // the most recent read, used for determining when we've hit already loaded data
            //todo rename to lastCommit
            lastRead: null,    // when this is not null, we are in the middle of a run (e.g. the last run aborted)
            stats: {}
         });
         status = 'INIT';
      }
      else {
         // repo already exists
         repo = cache.stats.repos[repoName];

         // check to see if the repo was updated or aborted (is there anything to modify?)
         hasUpdates = repo.lastRead || moment(data.updated_at).diff(moment(repo.updated)) > 0;

         // now update the cached version with any changes to the repo meta data
         _.extend(repo, mapRepoData(data));

         hasUpdates && (status = repo.lastRead? 'CONTINUE' : 'UPDATE');
      }
      logger.info('REPO', status, repoName, repo.updated);
      logXLimit(arguments[3]);

      cache.stats.repos[repoName] = repo;

      initStatSet(repo.stats, conf.static);

      // update repo level stats
      _.extend(repo.stats, {
         watchers: data.watchers,
         issues: data.open_issues,
         forks: data.forks
      });

      // accumulate the same stats into trends as appropriate
      _.each(['watchers', 'issues', 'forks'], function(statKey) {
         incrementTrend(cache.trends, conf.trends, repoName, statKey, moment.utc(), repo.stats[statKey]);
      });

      if( hasUpdates ) {
         def = def.then(_.bind(function() {
            return this.gh.commits(repo.owner, repo.name, _.bind(this.addCommit, this), repo.lastRead);
         }, this));
      }
      else {
         def = Q.resolve();
      }

      def = def.then(_.bind(function() {
         // mark our repo completely updated
         repo.lastRead = null;

         // store the latest read so that on future updates we only have to read commits which we haven't read before
         // in the case that a commit fails, we don't update this; the next time this repo is updated we will start
         // reading from repo.lastRead and continue to the same target we aimed for last time (the prior repo.latestRead)
         repo.latestRead = this.tmp.firstCommits[repoName] || repo.latestRead;

         return repo;
      }, this));
   }
   return def;
};

StatsBuilder.prototype.addCommit = function(commit, owner, repoName) {
   var fullRepoName = _repoName(owner, repoName),
       repo = this.cache.stats.repos[fullRepoName],
       def = Q.defer();

   logXLimit(arguments[3]);

   if( repo.latestRead == commit.sha  ) {
      //we've found the last point at which commits were read successfully, so we can stop reading commits
      logger.debug('latestRead reached on repo', repoName, commit.sha);
      return false;
   }
   else if( !this.tmp.firstCommits[fullRepoName] ) {
      // store the first commit read for each repo; however, we don't add it to the repo until
      // all commits read successfully, otherwise, if we need to resume a failed read, we'll be in trouble
      this.tmp.firstCommits[fullRepoName] = commit.sha;
   }

   if( needsCommitDetails(this.conf) ) {
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
         logger.info('  '+(commitDetail? 'CC' : 'C'), fullRepoName, commit.sha, commit.commit.committer.date);
         addCommitStats(this.conf, this.cache, fullRepoName, commit, commitDetail);

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

function _parseCommitChanges(commit, commitDetail, hasBytes) {
   var stats = { files: 0, bytes: 0, lines: 0, adds: 0, deletes: 0, commits: 1 };
   if( commitDetail ) {
      var f, files = commitDetail.files, i = ~~(files && files.length);
      while(i--) {
         f = files[i];

         //todo filter files and dirs
         //todo
         //todo
         //todo
         //todo
         //todo
         //todo
         //todo
         //todo

         if( hasBytes ) {
            stats.bytes += fxns.analyzePatch(f.patch).diff;
         }
         switch(f.status) {
            case 'modified':
               stats.adds += f.additions;
               stats.deletes += f.deletions;
               stats.lines += (f.additions - f.deletions);
               break;
            case 'added':
               stats.adds += f.additions;
               stats.lines += f.additions;
               stats.files++;
               break;
            case 'removed':
               stats.deletes += f.deletions;
               stats.lines -= f.deletions;
               stats.files--;
               break;
            default:
               logger.error('I do not recognize this commit status', f.status, f.filename);
         }
      }
   }
   return stats;
}

function addCommitStats(conf, cache, fullRepoName, commit, commitDetail) {
   var trendsActive = conf.trends.active,
       statKeys =  _.union(fxns.activeKeys(conf.static), trendsActive? fxns.activeKeys(conf.trends.collect) : []),
       changes = _parseCommitChanges(commit, commitDetail, conf.static.bytes || conf.trends.collect.bytes),
       when = moment(commit.commit.committer.date).utc();

   logger.debug('changes', commit.sha, when.format(), util.inspect(changes));

   // merge the static and trends stats which are active and iterate them
   statKeys.forEach(function(statKey) {
      switch(statKey) {
         case 'watchers':
         case 'issues':
         case 'forks':
            break; // these are not part of the commit stats
         default:
            incrementStat(cache.stats, conf.static, fullRepoName, statKey, changes[statKey]);
            trendsActive && incrementTrend(cache.trends, conf.trends, fullRepoName, statKey, when, changes[statKey]);
      }
   });
}

function incrementStat(stats, statsToCollect, fullRepoName, statKey, amt) {
   if( statsToCollect[statKey] ) {
      var repo = stats.repos[fullRepoName];
//      logger.debug('incrementStat', statKey, amt, stats.total[statKey], repo.stats[statKey]);
      stats.total[statKey] += amt;
      repo.stats[statKey] += amt;
   }
}

function calculateAverages(cache, trendConf) {
   //todo
   //todo
   //todo
   //todo
   //todo
   //todo
}

function incrementTrend(trends, trendConf, repoName, statKey, when, amt) {
   if( trendConf.active && trendConf.collect[statKey] ) {
      var total = trends.total[statKey];
      var repo = (trendConf.repos && trends.repos[repoName][statKey]) || {};
      _.each(trendConf.intervals, function(v, interval) {
         if( v ) {
            var dateKey = fxns.intervalKey(when, interval), t = _findTrendStat(total[interval], dateKey), r = _findTrendStat(repo[interval], dateKey);
            t && (t[1] += amt);
            r && (r[1] += amt);
//            logger.debug('incrementTrend', [statKey, interval, dateKey].join('->'), amt, t && t[1], r && r[1]);
         }
      });
      trendConf.averages && _averageSourceData(trends.latest, trendConf.intervals, when, amt);
   }
}

function _findTrendStat(list, key) {
   return list? _.find(list, function(v) {
      return v && v[0] === key;
   }) : null;
}


function _averageSourceData(latest, intervals, when, amt) {
   var now = moment();
   if( intervals.months > 0 || intervals.weeks > 0 ) {
      _latest(latest, when, 'days', amt)
   }

   if( intervals.years > 0 ) {
      _latest(latest, when, 'months', amt);
   }
}

function _latest(latest, when, units, amt) {
   var start = fxns.startOf(when, units), working = latest[units];
   if( start.utc().format() !== working.period ) {
      //todo "close" the working.period and start a new one
      //todo
      //todo
      //todo
      //todo
      //todo

      //todo store the averages for the old period (they are now final)
      //todo
      //todo
      //todo
      //todo
      //todo
   }

   working.count++;
   working.total += amt;
   working.avg = Math.round(working.total / working.count);

   //todo store the averages ?
   //todo
   //todo
   //todo
   //todo
   //todo
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
      var d = moment.utc(), res;
      if( i > 0 ) { d.subtract(units, i); }
      var ds = fxns.intervalKey(d, units);
      res = [ds, cache[1] || 0];
      out.push(res);
   }
   return out;
}

function cacheForTrend(trendSet, units) {
   return trendSet && trendSet[units]? trendSet[units] : [];
}

function _buildFileFilters(lastUpdate, conf) {
   var out = { since: lastUpdate };
   _.each(['file', 'dir'], function(v) {
      if( conf.filters[v] ) {
         out[v] = conf.filters[v];
      }
   });
   return out;
}

function _repoName(owner, repo) {
   return owner+'/'+repo;
}

function needsCommitDetails(conf) {
   function _check(v, k) {
      return v && _.indexOf(REQUIRES_DETAIL, k) >= 0;
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

function logXLimit(meta) {
   meta && logger.debug('x-ratelimit-remaining', meta['x-ratelimit-remaining']);
}

function initStatSet(stats, statHash, val) {
   val || (val = 0);
   _.each(fxns.activeKeys(statHash), function(key) {
      stats[key] || (stats[key] = 0);
   });
}

function _initTrends(trends, conf) {
   if( conf.trends.active ) {
      trends.total = buildTrends(conf.trends, trends.total);
      if( conf.trends.repos ) {
         trends.repos = {};
      }
   }
}