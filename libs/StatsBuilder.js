
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
   this.gh = new GitHubWrap(conf.user, conf.pass);
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.trends.intervals);
   this.lastUpdate = moment.utc().subtract('years', 20).startOf('year');
   this.cache = fxns.readCache(conf.cache_file) || { stats: { repos: {} }, trends: { repos: {} } };
   this.stats = {
      lastUpdate: this.cache.stats.lastUpdate || this.lastUpdate.format(),
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
//   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
//   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises).then(_.bind(function() {
      //debug
//      fxns.cache({stats: this.stats, trends: this.trends}, conf.cache_file);
      return this;
   }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   console.log('ORG', org.login);//debug
   this.stats.orgs.push({name: org.login, url: org.url});
   return this.gh.repos(org.login, _.bind(this.addRepo, this));
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, promises = [], oldStats = {};
   if( !conf.repoFilter || conf.repoFilter(data) ) {

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
            lastCommitRead: null,
            url: data.html_url,
            owner: data.owner.login || data.owner.name,
            stats: {
               watchers: data.watchers,
               issues: data.open_issues,
               forks: data.forks
            }
         };
      }
      else {
         console.log('UPDATE', repoName, data.updated_at);
         // if the repo already exists, we just update the cached version with any new commit data
         repo = this.cache.stats.repos[repoName];
         oldStats = repo.stats;
         repo.stats = {};
      }

      _.each(conf.static, function(v, k) {
         if( v ) {
            switch(k) {
               case 'changes':
                  _.each(['adds', 'deletes', 'updates'], function(v) {
                     if( !_.has(repo.stats, v) ) {
                        repo.stats[v] = oldStats[k] || 0;
                     }
                  });
                  break;
               default:
                  repo.stats[k] = oldStats[k] || 0;
            }
         }
      });

      //todo only collect files if we're building the initial stats
//      var filters = _buildFileFilters(this.lastUpdate, conf);
//      promises.push( this.gh.files(repo.owner, repo.name, _.bind(this.addFile, this), filters) );

      //todo
      //todo collect commits
      //todo
   }
   return Q.all(promises);
};

var gotOne = 0;

StatsBuilder.prototype.addFile = function(file, repo, owner) {
   console.log('  F', file.name, repo, owner, file);
   var stats = this.stats.repos[_repoName(owner, repo)].stats,
       def = needsFileDetails(this.conf)? this.gh.file(owner, repo, file.path) : null;

   //todo
   //todo repo: files, lines, bytes, commits, changes
   //todo trends: files, lines, bytes, commits, changes

   return def? def.promise : null;
};

StatsBuilder.prototype.addCommit = function(commit) {
   console.log('  C', commit.sha);
   //todo
   //todo repo: commits
   //todo trends: commits
   //todo if conf.collect.addsAndDeletes, then get commit detail
   //todo
};

StatsBuilder.prototype.addCommitDetail = function(commitDetail) {
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
   var list = ['files', 'lines', 'bytes', 'changes'];
   function _check(v, k) {
      return v && _.indexOf(list, k) >= 0;
   }
   return _.any(conf.static, _check) || _.any(conf.trends.collect, _check);
}

function applyFileStats(file, stats, collectFields) {
   _.each(collectFields, function(v, k) {
      if( v ) {
         switch(k) {
            case 'files':
               stats.files++;
               break;
            case 'lines':
               def.then(function(file) {
                  stats.lines += base64.decode(file.content).split("\n").length;
               });
               break;
            case 'bytes':
               //todo
               //todo
               //todo
               //todo
               //todo
               break;
            case 'commits':
               //todo
               //todo
               //todo
               //todo
               break;
            case 'changes':
               //todo
               //todo
               //todo
               //todo
               break;
            default:
               throw new Error('invalid configuration key '+k);
         }
         //todo
         //todo
         //todo
         //todo
         //todo
      }
   });
}