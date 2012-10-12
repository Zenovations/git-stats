
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
   this.since = fxns.oldestInterval(conf.trends.intervals);
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
   if( conf.trends.active ) {
      this.trends.total = buildTrends(conf.trends); //todo cache
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

      //todo
      //todo apply lastUpdate and cached data
      //todo

      console.log('addRepo', data.full_name);//debug
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
            forks: data.forks
         }
      };

      if( conf.trends.active ) {
         this.trends.repos[data.full_name] = buildTrends(conf.trends); //todo-cache
      }

      _.each(conf.static, function(v, k) {
         if( v ) {
            switch(k) {
               case 'changes':
                  _.extend(repo.stats, { adds: 0, deletes: 0, updates: 0 }); //todo-cache
                  break;
               default:
                  repo.stats[k] = 0; //todo-cache
            }
         }
      });

      var filters = _buildFileFilters(this.lastUpdate, conf);
      promises.push( gh.files(repo.owner, repo.name, _.bind(this.addFile, this), filters) );

      //todo
      //todo collect commits
      //todo
   }
   return Q.all(promises);
};

var gotOne = 0;

StatsBuilder.prototype.addFile = function(file, repo, owner) {
   console.log('addFile', file.name, repo, owner);
   var stats = this.stats.repos[_repoName(owner, repo)].stats;

   //todo merge static and trends and do both at same time
   _.each(this.conf.static, function(v, k) {
      if( v ) {
         switch(k) {
            case 'files':

               break;
            case 'lines':

               break;
            case 'bytes':

               break;
         }
         //todo
         //todo
         //todo
         //todo
         //todo
      }
   });
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

function buildTrends(conf, cache) {
   cache || (cache = {});
   var intervals = conf.intervals, out = {};
   _.each(conf.collect, function(v, k) {
      if( !v ) { return; }
      switch(k) {
         case 'changes':
            out.adds = _trendIntervals(intervals, cache.adds);
            out.deletes = _trendIntervals(intervals, cache.deletes);
            out.changes = _trendIntervals(intervals, cache.changes);
            break;
         default:
            out[k] = _trendIntervals(intervals, cache[k]);
      }
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
   return t? _.object(_.pluck(t, 'date'), _.pluck(t, 'count')) : {};
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