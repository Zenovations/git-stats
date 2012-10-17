
var
   Q          = require('q'),
   _          = require('underscore'),
   base64     = require('./base64.js'),
   GitHubWrap = require('./github.js'),
   fxns       = require('./fxns.js'),
   moment     = require('moment'),
   util       = require('util'),
   nodemailer = require("nodemailer");

function StatsBuilder(conf) {
   this.gh = new GitHubWrap(conf.user, conf.pass, _.bind(this.rateLimitExceeded, this));
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.trends.intervals);
   this.cache = fxns.readCache(conf.cache_file) || { stats: { repos: {} }, trends: { repos: {} } };
   this.lastUpdate = moment(this.cache.stats.lastUpdate).utc().subtract('years', 100);
   this.stats = {
      lastUpdate: this.cache.stats.lastUpdate,
      orgs: [],
      repos: {}
   };
   this.trends = {};
   if( conf.trends.active ) {
      this.trends.total = buildTrends(conf.trends, this.cache.trends.total);
      if( conf.trends.repos ) {
         this.trends.repos = {};
      }
   }

//   console.log(util.inspect(this.stats, false, 5, true));
//   console.log(util.inspect(this.trends, false, 5, true));
   var promises = [];
   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises)
      .then(_.bind(function(result) {
         //debug
//         fxns.cache({stats: this.stats, trends: this.trends}, conf.cache_file);
         return this;
      }, this))
      .fail(_.bind(function(e, sha) {
         if( e === 'rate limit exceeded' ) {

         }
      }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   console.log('ORG', org.login);//debug
   this.stats.orgs.push({name: org.login, url: org.url});
   return this.gh.repos(org.login, _.bind(this.addRepo, this));
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, promises = [], oldStats = {}, when = moment(data.last_updated);
   if( this.lastUpdate.diff(when) < 0 && (!conf.repoFilter || conf.repoFilter(data)) ) {

      var repoName = data.full_name;
      if( conf.trends.active && conf.trends.repos ) {
         // set up the trends entries, we don't use any cached data because the keys change based on when this runs
         // so build the keys from scratch and then apply cache to any matching keys
         this.trends.repos[repoName] = buildTrends(conf.trends, this.cache.trends.repos[repoName]);
      }

      if( !this.cache.stats.repos[repoName] ) {
         // the repo doesn't exist in our cache, so we need to load initial stats data
         console.log('INIT', repoName, data.updated_at);//debug
         var repo = this.stats.repos[repoName] = {
            name: data.name,
            fullName: repoName,
            size: data.size,
            created: data.created_at,
            updated: data.updated_at,
            description: data.description,
            homepage: data.homepage,
            lastCommit: null,
            url: data.html_url,
            owner: data.owner.login || data.owner.name,
            stats: {} // always clear stats (config may change)
         };

         oldStats = {
            watchers: data.watchers,
            issues: data.open_issues,
            forks: data.forks
         }
      }
      else {
         console.log('UPDATE', repoName, data.updated_at);
         // if the repo already exists, we just update the cached version with any new commit data
         repo = this.cache.stats.repos[repoName];
         // cache old stats
         oldStats = _.extend({}, repo.stats, {
            watchers: data.watchers,
            issues: data.open_issues,
            forks: data.forks
         });
         // always clear stats (config may change)
         repo.stats = {};
      }

      //todo
      //todo
      //todo
      //todo
      //todo
      //todo
      //todo store watchers/issues/forks in trends

      //todo
      //todo
      //todo
      //todo
      //todo
      //todo
      //todo deal with cases where rate limit was exceeded and we need to resume

      _.each(conf.static, function(v, k) {
         if( v ) {
            repo.stats[k] = oldStats[k] || 0;
         }
      });

//      var filters = _buildFileFilters(this.lastUpdate, conf);
//      promises.push( this.gh.files(repo.owner, repo.name, _.bind(this.addFile, this), filters) );

      //todo
      //todo collect commits
      //todo
   }
   else { console.log('skipped', data.full_name); }//debug
   return Q.all(promises);
};

//var gotOne = 0;
//StatsBuilder.prototype.addFile = function(file, repo, owner) {
//   console.log('  F', file.name, repo, owner, file);
//   var stats = this.stats.repos[_repoName(owner, repo)].stats,
//       def = needsFileDetails(this.conf)? this.gh.file(owner, repo, file.path) : null;
//
//   //todo
//   //todo repo: files, lines, bytes, commits, changes
//   //todo trends: files, lines, bytes, commits, changes
//
//   return def? def.promise : null;
//};

StatsBuilder.prototype.addCommit = function(commit) {
   console.log('  C', commit.sha);
   //todo
   //todo repo: commits
   //todo trends: commits
   //todo if conf.collect.addsAndDeletes, then get commit detail
   //todo
};

StatsBuilder.prototype.applyCommitDetail = function(commit, commitDetail) {
   console.log('  CC', commitDetail.sha);
   //todo
   //todo repo: adds/deletes/updates
   //todo trends: adds/deletes/updates
   //todo
};

StatsBuilder.prototype.getTrends = function(format, compress) {
   var data = format=='xml'? fxns.prepTrendsForXml(this.trends) : this.trends;
   return fxns.format(format, compress, data);
};

StatsBuilder.prototype.getStats = function(format, compress) {
   var data = format=='xml'? fxns.prepStatsForXml(this.stats) : this.stats;
   return fxns.format(format, compress, data);
};

exports.load = function(conf) {
   return new StatsBuilder(conf).promise;
};

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
      var d = fxns.startOf(moment.utc(), units);
      if( i > 0 ) { d.subtract(units, i); }
      var ds = d.format();
      out.push([d.format(), cache[ds]? cache[ds] : 0]);
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

function needsFileDetails(conf) {
   return conf.static.bytes || conf.static.lines || conf.trends.bytes || conf.trends.lines;
}

function needsCommitDetails(conf, isUpdate) {
   var list = ['lines', 'bytes', 'adds', 'deletes'];
   function _check(v, k) {
      return v && _.indexOf(list, k) >= 0;
   }
   return _.any(conf.static, _check) || _.any(conf.trends.collect, _check);
}
