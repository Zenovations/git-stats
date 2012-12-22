
var
   Q          = require('q'),
   _          = require('underscore'),
   fxns       = require('./fxns'),
   GitHubWrap = require('./github'),
   Repo       = require('./Repo'),
   Trend      = require('./Trend'),
   logger     = fxns.logger(),
   REQUIRES_DETAIL = ['files', 'lines', 'bytes', 'adds', 'deletes'];

exports.load = function(conf) {
   return new StatsBuilder(conf).promise;
};

/**
 * @param {object} conf
 * @constructor
 */
function StatsBuilder(conf) {
   this.gh    = new GitHubWrap(conf.user, conf.pass);
   this.conf  = conf;
   this.cache = fxns.readCache(conf);

   // look over the cached data and verify the integrity
   // always zero totals because they are re-totaled based on repo stats after each run
   this.cache.total.stats = fxns.initStatSet(conf.static, {});

   if( conf.trends.active ) {
      // each time we build stats we'll recalculate which intervals are being monitored
      this.intervalKeys = fxns.intervalKeys(conf.trends.intervals);

      // build trend to total repos
      var statKeys = fxns.activeKeys(conf.trends.collect);
      var normalizedTrends = fxns.normalizeTrends(statKeys, this.intervalKeys, this.cache.intervalKeys, this.cache.total.trends);
      this.cache.total.trends = new Trend(statKeys, conf.trends.format, this.intervalKeys, normalizedTrends);
   }

   // temporary state info used internally to connect the methods together without too much coupling
   this.tmp = {
      firstCommits: {},
      reposFound: []
   };

   var promises = [];
   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
   this.promise = Q.all(promises)
      .then(_.bind(function() {
         // we only do this if no errors occurred and all data was processed; in the case that some data was skipped,
         // or an error occurred, we could be missing a valid repo and accidentally destroy the data
         _.difference(_.keys(this.cache.repos), this.tmp.reposFound).forEach(_.bind(function(k) { //todo-abstract
            logger.warn('deleted old repo', k);
            if( conf.move_deleted_repos_to_inactive ) {
               // make a copy in the inactive list before removing from the active repos
               this.cache.inactive[k] = this.cache.repos[k];
            }
            delete this.cache.repos[k];
         }, this));
         return this;
      }, this))
      .fail(_.bind(function(e) {
         if( isRateError(e) ) { //todo-abstract
            // if the rate limit is exceeded, we'll get interrupted right in the middle of collecting fun stuff
            // so what we're going to do here is wait for all the outstanding activities to be resolved, then we're
            // going to cache whatever we've managed to collect and call it happy
            logger.warn('Rate Limit Exceeded; results may be incomplete', e.toString());
            return this;
         }
         else {
            throw e;
         }
      }, this))
      .fin(_.bind(function() {
         // replace the cached intervalKeys
         this.cache.intervalKeys = this.intervalKeys;

         // calculate total stats
         _.each(this.cache.repos, _.bind(function(v) { //todo-abstract
            fxns.addStats(this.cache.total.stats, v.stats);
         }, this));

         if( conf.cache_file ) {
            fxns.cache(this.cache, conf);
         }
      }, this));
}

StatsBuilder.prototype.raw = function() {
   return this.format('raw', true);
};

StatsBuilder.prototype.format = function(format, compress) {
   var trendsActive = this.conf.trends.active;
   var data = _extractDataFromCache(this.conf.trends.active, this.cache);
   format == 'xml' && (data = fxns.prepStatsForXml(data));
   return fxns.format(format, compress, data);
};

StatsBuilder.prototype.addOrg = function(org) {
   var promises = [];
   if( !this.conf.filters.org || this.conf.filters.org(org, this.conf) ) {
      logger.info('ORG', org.login);
      var orgs = this.cache.orgs, orgEntry = {name: org.login, url: org.url};
      if(_.where(orgs, orgEntry).length < 1 ) {
         this.cache.orgs.push(orgEntry);
      }
      //promises.push( this.gh.repos(org.login, _.bind(this.addRepo, this)) );
   }
   return Q.all(promises);
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, def = Q.resolve(null);
   if( !conf.filters.repo || conf.filters.repo(data) ) {
      var fullRepoName = data.full_name, cache = this.cache;
      this.tmp.reposFound.push(fullRepoName); // used to delete cached repos that don't exist anymore

      var repo = new Repo(data, conf, this.intervalKeys, cache);
      logger.info(repo.status, repo.name);

      if( repo.status !== 'NOCHANGE' ) {
         def = this.gh.commits(repo.owner, repo.short, _.bind(repo.addCommit, repo), repo.lastRead, needsCommitDetails(this.conf));
      }
      else {
         def = Q.resolve();
      }

      return def
         .then(_.bind(function() {
            logger.debug('completed', repo.name);

            // mark our repo completely updated
            repo.lastRead = null;

            // store the latest read so that on future updates we only have to read commits which we haven't read before
            // in the case that a commit fails, we don't update this; the next time this repo is updated we will start
            // reading from repo.lastRead and continue to the same target we aimed for last time (the prior repo.latestRead)
            repo.latestRead = repo.firstCommit || repo.latestRead;

            // stored if operation succeeds completely
            cache.repos[fullRepoName] = repo;

            return repo.status;
         }, this))
         .fail(function(e) {
            if( isRateError(e) ) {
               // also stored if it's just a rate error
               cache.repos[fullRepoName] = repo;
            }
            throw e;
         });
   }
   return def;
};

function needsCommitDetails(conf) {
   var staticKeys = fxns.activeKeys(conf.static), trendKeys = conf.trends.active? fxns.activeKeys(conf.trends.collect) : [];
   return _.intersection(_.union(staticKeys, trendKeys), REQUIRES_DETAIL).length > 0;
}

function isRateError(e) {
   return _.isObject(e) && e.code == 403 && e.message.indexOf('Rate Limit Exceeded') > -1;
}

function _extractDataFromCache(trendsActive, cache) {
   var data = fxns.deepCopy(_.pick(cache, trendsActive? ['total', 'orgs', 'repos', 'intervalKeys'] : ['total', 'orgs', 'repos']));
   if( !trendsActive ) {
      delete data.total.trends;
      data.repos && _.each(data.repos, function(repo, name) {
         delete repo.trends;
      });
   }
   return data;
}