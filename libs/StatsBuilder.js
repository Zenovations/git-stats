
var
   Q          = require('q'),
   _          = require('underscore'),
   base64     = require('./base64.js'),
   gh         = require('./github.js'),
   fxns       = require('./fxns.js'),
   inflection = require('inflection'),
   moment     = require('moment'),
   util       = require('util'),
   nodemailer = require("nodemailer"),
   FS         = require('fs');

function StatsBuilder(conf) {
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.collect.intervals);
   this.lastUpdate = moment.utc().subtract('years', 20).startOf('year');
   //todo
   //todo retrieve cache and apply it
   //todo
   this.stats = {
      lastUpdate: this.lastUpdate.format(),
      orgs: [],
      repos: {}
   };
   this.trends = {};
   if( conf.collect.trends ) {
      this.trends.total = buildTrends(conf.collect); //todo cache
      this.trends.repos = {};
   }
   var promises = [];
   promises.push( gh.repos(conf.user, _.bind(this.addRepo, this)) );
   promises.push( gh.orgs( conf.user, _.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises).then(_.bind(function() {
      fxns.cache({stats: this.stats, trends: this.trends}, conf.cache_file);
      return this;
   }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   console.log('addOrg', org.login);//debug
   this.stats.orgs.push({name: org.login, url: org.url});
   return gh.repos(this.conf.user, org.login, _.bind(this.addRepo, this));
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, promises = [];
   if( !conf.repoFilter || conf.repoFilter(data) ) {
      console.log('addRepo', data.full_name);//debug
      var collect = conf.collect;
      var repo = this.stats.repos[data.full_name] = {
         name: data.name,
         fullName: data.full_name,
         size: data.size,
         created: data.created_at,
         updated: data.updated_at,
         description: data.description,
         homepage: data.homepage,
         url: data.html_url,
         owner: data.owner.login || data.owner.name,
         stats: {
            watchers: data.watchers,
            issues: data.open_issues,
            forks: data.forks,
            commits: 0
         }
      };

      if( collect.trends ) {
         this.trends.repos[data.full_name] = buildTrends(collect); //todo cache?
      }
      if( collect.addsAndDeletes ) {
         _.extend(repo.stats, { adds: 0, deletes: 0, updates: 0 });
      }
      if( collect.files ) {
         _.extend(repo.stats, { files: 0, lines: 0, bytes: 0 });
         //todo
         //todo collect the files
         //todo
      }

      //todo
      //todo go collect the commits
      //todo
   }
   return Q.all(promises);
};

StatsBuilder.prototype.addFile = function(file) {
   console.log('addFile', file.name);
   //todo
   //todo repo: files, lines, bytes
   //todo trends: files, lines, bytes
};

StatsBuilder.prototype.addCommit = function(commit) {
   console.log('addCommit', commit.sha);
   //todo
   //todo repo: commits
   //todo trends: commits
   //todo if conf.collect.addsAndDeletes, then get commit detail
   //todo
};

StatsBuilder.prototype.addCommitDetail = function(commitDetail) {
   console.log('addCommitDetail', commitDetail.sha);
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

function buildTrends(collect, cache) {
   cache || (cache = {});
   var intervals = collect.intervals;
   var out = { commits: _trendIntervals(intervals, cache.commits) };
   if( collect.addsAndDeletes ) {
      out.adds = _trendIntervals(intervals, cache.adds);
      out.deletes = _trendIntervals(intervals, cache.deletes);
   }
   if( collect.files ) {
      out.files = _trendIntervals(intervals, cache.files);
      out.lines = _trendIntervals(intervals, cache.lines);
      out.bytes = _trendIntervals(intervals, cache.bytes);
   }
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
   return t? _.object(_.pluck(t, 'date'), _.pluck(t, 'count')) : {};
}
