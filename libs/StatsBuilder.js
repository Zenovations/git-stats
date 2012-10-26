
var
   Q          = require('q'),
   _          = require('underscore'),
   fxns       = require('./fxns'),
   GitHubWrap = require('./github'),
   Repo       = require('./Repo'),
   Trend      = require('./Trend'),
   logger     = fxns.logger();

/**
 * @param {object} conf
 * @constructor
 */
function StatsBuilder(conf) {
   this.gh    = new GitHubWrap(conf.user, conf.pass);
   this.conf  = conf;
   this.since = fxns.oldestInterval(conf.trends.intervals);
   this.cache = fxns.readCache(conf);

   // look over the cached data and verify the integrity
   fxns.initStatSet(this.cache.total.stats, conf.static);

   // build trend to total repos
   if( conf.trends.active ) {
      this.cache.total.trends = new Trend(conf.trends.collect, conf.trends.intervals, this.cache.total.trends);
   }

   // temporary state info used internally to connect the methods together without too much coupling
   this.tmp = {
      firstCommits: {},
      reposFound: []
   };

//   logger.log(util.debug(this.cache.stats, false, 5, true));
//   logger.log(util.debug(this.cache.trends, false, 5, true));
   var promises = [];
   promises.push( this.gh.repos(_.bind(this.addRepo, this)) );
   promises.push( this.gh.orgs(_.bind(this.addOrg,  this)) );
   this.promise = Q.all(promises)
      .then(_.bind(function() {
         // we only do this if no errors occurred and all data was processed; in the case that some data was skipped,
         // or an error occurred, we could be missing a valid repo and accidentally destroy the data
         _.without(_.keys(this.cache.repos), this.tmp.reposFound).forEach(_.bind(function(k) {
            console.debug('deleted old repo', k);
            delete this.cache.repos[k];
         }, this));
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
         // calculate total stats
         _.each(this.repos, _.bind(function(v) {
            _addStats(this.cache.total.stats, v.stats);
         }, this));

         //todo
         //todo
         //todo
         //fxns.cache(this.cache, conf); //todo
      }, this));
}

StatsBuilder.prototype.addOrg = function(org) {
   var promises = [];
   if( !this.conf.filters.org || this.conf.filters.org(org, this.conf) ) {
      logger.info('ORG', org.login);
      var orgs = this.cache.orgs, orgEntry = {name: org.login, url: org.url};
      if(_.indexOf(orgs, orgEntry) < 0 ) {
         this.cache.orgs.push(orgEntry);
      }
      promises.push( this.gh.repos(org.login, _.bind(this.addRepo, this)) );
   }
   return Q.when(promises);
};

StatsBuilder.prototype.addRepo = function(data) {
   var conf = this.conf, def = Q.resolve(null);
   if( !conf.filters.repo || conf.filters.repo(data) ) {
      var fullRepoName = data.full_name, cache = this.cache;
      this.reposFound.push(fullRepoName); // used to delete cached repos that don't exist anymore

      def = Repo.load(this.gh, data, conf, cache).then(function(repo) {
         // only store if it succeeds completely
         cache.stats.repos[fullRepoName] = repo;

         return repo;
      });
   }
   return def;
};

StatsBuilder.prototype.raw = function() {
   return this.format('raw', true);
};

StatsBuilder.prototype.format = function(format, compress) {
   var data = _.pick(this.cache, this.conf.trends.active? ['stats', 'trends'] : ['stats']);
   format == 'xml' && (data = fxns.prepStatsForXml(data));
   //todo csv is busted :(
   //todo
   //todo
   //todo
   return fxns.format(format, compress, data);
};

exports.load = function(conf) {
   return new StatsBuilder(conf).promise;
};

function _addStats(target, source) {
   _.each(_.keys(target), function(key) {
      target[key] += source[key];
   });
}
