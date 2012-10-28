
var
   Q          = require('q'),
   _          = require('underscore'),
   fxns       = require('./fxns.js'),
   moment     = require('moment'),
   Trend      = require('./Trend.js'),
   logger     = fxns.logger(),
   util       = require('util'),
   STATIC_STATS = ['watchers', 'forks', 'issues'],
   undef;

module.exports = Repo;

function Repo(data, conf, total, cache) {
   cache || (cache = {});
   this.name  = data.full_name;
   this.owner = data.owner.login;
   this.short = data.name;
   this.meta  = mapRepoData(data);
   this.total = total;
   this.trendsActive = conf.trends.active;
   this.repoTrendsActive = conf.trends.active && conf.trends.repos;
   this.collectBytes = conf.static.bytes || (conf.trends.active && conf.trends.collect.bytes);
   this.staticKeys = fxns.activeKeys(conf.static);
   this.trendKeys = this.repoTrendsActive? fxns.activeKeys(conf.trends.collect) : [];
   this.fileFilter = conf.filters.file;

   //todo coupled with StatsBuilder.addRepo; meh
   this.lastRead = cache.lastRead;
   this.latestRead = cache.latestRead;

   // coupled witch StatsBuilder.addRepo and used below in addCommit (see notes there)
   this.firstCommit = null;

   // the static numbers for this repo
   this.stats = fxns.initStatSet(conf.static, cache.stats);

   // update repo level stats directly; they are not cumulative
   _.extend(this.stats, {
      watchers: ~~data.watchers,
      issues: ~~data.open_issues,
      forks: ~~data.forks
   });

   this.status = _status(this.meta, cache);

   if( this.repoTrendsActive ) {
      this.trends = new Trend(this.trendKeys, conf.trends.intervals, cache.trends);
   }

   if( this.status !== 'NOCHANGE' ) {
      // accumulate the new stats into trends as appropriate
      this.acc(this.meta.updated, _.pick(this.stats, STATIC_STATS));
   }
}

Repo.prototype.acc = function(when, changes) {
   if( this.trendsActive ) {
      this.total.trends.acc(when, changes);

      if( this.repoTrendsActive ) {
         // set up the trends entries, we don't just build off cached data because the keys change
         // so build the keys from scratch and then apply cache to any matching keys
         this.trends.acc(when, changes);
      }
   }
};

/**
 * Reads commit data and accumulates the stats for each read. Will ensure that no commit is read twice (based
 * on the last commit read and the assumption that newer commits always appear first) and will gracefully handle
 * cases where the last attempt aborted and only some commits were added (using repo.lastRead and repo.latestRead)
 *
 * @param {object} commit the output of gh.commit (libs/gihtub.js)
 * @return {Boolean} false to cancel iterations of commits or true to continue
 */
Repo.prototype.addCommit = function(commit) {
   logXLimit(arguments[3]);

   // see if we need to read this commit
   if( this.lastRead === commit.sha ) {
      // we are continuing a read that was aborted previously
      // however, the lastRead is actually returned in the data if it is specified,
      // so intercept and don't read it twice but do continue iterations
      return true;
   }
   else if( this.latestRead === commit.sha  ) {
      // we've found the start of the last successful run, so we can stop reading commits here
      logger.debug('latestRead reached, not reading anymore commits', this.name, commit.sha);
      return false;
   }
   else if( !this.firstCommit ) {
      // store the first commit read; later we will decide if it goes into the cached data (only if all reads succeed)
      // unfortunately, this is currently coupled with StatsBuilder.addRepo, which uses this variable directly
      this.firstCommit = commit.sha;
   }

   // parse the commit/commitDetail objects and obtain all stats for them
   var changes  = _parseCommitChanges(commit, this.collectBytes, this.fileFilter);

   var when = moment(commit.commit.committer.date).utc();
   logger.info('  C', this.name, commit.sha, when.format());
   logger.debug(JSON.stringify(changes));

   // accumulate trends
   if( this.trendsActive ) {
      this.total.trends.acc(when, changes);
      this.repoTrendsActive && this.trends.acc(when, changes);
   }
   // accumulate statistics
   addCommitStats(this.staticKeys, this, changes);

   // each successful read is stored by key so if we abort or fail before completing the repo, we know where to start again
   this.lastRead = commit.sha;

   return true;
};

/**
 * Modifies output when JSON.stringify is used on this object
 * @return {object}
 */
Repo.prototype.toJSON = function() {
   return _.extend(
      { lastRead: this.lastRead, latestRead: this.latestRead },
      this.meta, //todo need to format the moments!
      {stats: this.stats},
      this.repoTrendsActive? {trends: this.trends} : {}
   )
};

function mapRepoData(data) {
   return {
      name: data.name,
      fullName: data.full_name,
      size: data.size,
      created: moment(data.created_at).utc(),
      updated: moment(data.updated_at).utc(),
      description: data.description,
      homepage: data.homepage,
      url: data.html_url,
      owner: data.owner.login || data.owner.name
   };
}

function logXLimit(meta) {
   var k = 'x-ratelimit-remaining', qty = meta[k], m = qty && qty < 10? 'warn' : 'debug';
   meta && logger[m](k, qty);
}

function _parseCommitChanges(commit, hasBytes, fileFilter) {
   var stats = { files: 0, bytes: 0, lines: 0, adds: 0, deletes: 0, commits: 1 };
   if( commit.files ) {
      var f, files = commit.files, i = ~~(files && files.length);
      while(i--) {
         f = files[i];

         if( fileFilter && !fileFilter(f) ) {
            continue;
         }

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

function addCommitStats(staticKeys, repo, changes) {
   // merge the static and trends stats which are active and iterate them
   _.intersection(staticKeys, _.keys(changes)).forEach(function(statKey) {
      //repo.total.stats[statKey] += changes[statKey]; // done after completion of all repos now (in StatsBuilder)
      repo.stats[statKey] += changes[statKey];
   });
}

function _status(meta, cache) {
   if( cache.lastRead ) {
      return 'RESUME';
   }
   else if( !cache.updated ) {
      return 'INIT';
   }
   else if( meta.updated.diff(cache.updated) < 0 ) {
      return 'UPDATE';
   }
   else {
      return 'NOCHANGE';
   }
}
