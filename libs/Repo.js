
var
   Q          = require('q'),
   _          = require('underscore'),
   fxns       = require('./fxns.js'),
   moment     = require('moment'),
   Trend      = require('./Trend.js'),
   logger     = fxns.logger(),
   util       = require('util'),
   REQUIRES_DETAIL = ['files', 'lines', 'bytes', 'adds', 'deletes'],
   undef;

function Repo(gh, data, conf, total, cache) {
   cache || (cache = {});
   this.name  = data.full_name;
   this.meta  = mapRepoData(data);
   this.total = total;
   this.conf  = conf;

   this.firstCommit = null;
   this.stats = _.extend({}, cache.stats);
   fxns.initStatSet(this.stats, conf.static);

   // update repo level stats
   _.extend(this.stats, {
      watchers: data.watchers,
      issues: data.open_issues,
      forks: data.forks
   });

   this.status = _status(this.meta, cache);      //todo
   this.updateStart = _start(this.meta, conf); //todo

   this.trends = {};
   if( conf.trends.active && conf.trends.repos ) {
      this.trends = new Trend(conf.trends.collect, conf.trends.intervals, this.trends);
   }

   if( this.status !== 'NOCHANGE' ) {
      // accumulate the same stats into trends as appropriate
      this.acc(this.meta.updated, this.stats);
   }
}

Repo.load = function(gh, data, conf, cache) {
   //todo this is the wrong cache to pass in here; need to pass cache.stats.repos[fullRepoName]
   var fullRepoName = data.full_name, repoCache = cache.stats.repos[fullRepoName], def;
   var repo = new Repo(gh, data, conf, repoCache);

   if( repo.status !== 'NOCHANGE' ) {
      //todo make this repo.update?
      def = gh.commits(repo.owner, repo.name, _.bind(repo.addCommit, repo), repo.lastRead);
   }
   else {
      def = Q.resolve();
   }

   return def.then(_.bind(function() {
      // mark our repo completely updated
      repo.lastRead = null;

      // store the latest read so that on future updates we only have to read commits which we haven't read before
      // in the case that a commit fails, we don't update this; the next time this repo is updated we will start
      // reading from repo.lastRead and continue to the same target we aimed for last time (the prior repo.latestRead)
      repo.latestRead = repo.firstCommit || repo.latestRead;

      return repo;
   }, this));
};

Repo.prototype.acc = function(when, changes) {
   var conf = this.conf;

   if( conf.trends.active ) {
      this.total.trends.acc(this.meta.updated, this.stats);

      if( conf.trends.active && conf.trends.repos ) {
         // set up the trends entries, we don't just build off cached data because the keys change
         // so build the keys from scratch and then apply cache to any matching keys
         this.trends.acc(this.meta.updated, this.stats);
      }
   }
};

Repo.prototype.addCommit = function(commit) {
   var fullRepoName = this.name,
      repo = this,
      def = Q.defer();

   logXLimit(arguments[3]);

   if( repo.latestRead == commit.sha  ) {
      //we've found the last point at which commits were read successfully, so we can stop reading commits
      logger.debug('latestRead reached on repo', repoName, commit.sha);
      return false;
   }
   else if( !this.firstCommit ) {
      // store the first commit read for each repo; however, we don't add it to the repo until
      // all commits read successfully, otherwise, if we need to resume a failed read, we'll be in trouble
      this.firstCommit = commit.sha;
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
      def.resolve([commit]);
   }

   // A commit is all or nothing.
   //
   // We wait for full resolution before adding this commit to the stats. In this way if
   // the operation fails, we have not added partial stats that will corrupt the results
   return def.promise.then(
      _.bind(function(commitData) {
         // Q doesn't allow two arguments in resolve(...) so we have to pass an array here
         var commit = commitData[0];
         var when = moment(commit.commit.committer.date);

         // parse the commit/commitDetail objects and obtain all stats for them
         var changes  = _parseCommitChanges(commit, commitData[1], this.conf.static.bytes || this.conf.trends.collect.bytes);

         logger.info('  C', fullRepoName, commit.sha, when.format(), util.inspect(changes));

         // accumulate trends
         if( this.conf.trends.active ) {
            this.cache.trends.total.acc(when, changes); //todo
            this.conf.trends.repos && this.cache.trends.repos[fullRepoName].acc(when, changes); //todo
         }
         // accumulate statistics
         addCommitStats(this.conf, this.cache, fullRepoName, changes); //todo

         // each successful read is stored by key so if we abort or fail before completing the repo, we know where to start again
         repo.lastRead = commit.sha;

         return commit;
      }, this)
   );
};

Repo.prototype.toJSON = function() {
   return _.extend(
      { lastRead: this.lastRead, latestRead: this.latestRead },
      this.meta, //todo need to format the moments!
      {stats: this.stats}
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
   meta && logger.debug('x-ratelimit-remaining', meta['x-ratelimit-remaining']);
}

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

function addCommitStats(conf, cache, fullRepoName, changes) {
   var statKeys =  _.without(conf.static, ['watchers', 'issues', 'forks']); // watchers/issues/forks are not in commit data

   // merge the static and trends stats which are active and iterate them
   statKeys.forEach(function(statKey) {
//      logger.debug('incrementStat', statKey, amt, stats.total[statKey], repo.stats[statKey]);
      cache.stats.total[statKey] += changes[statKey];
      cache.stats.repos[fullRepoName].stats[statKey] += changes[statKey];
   });
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

function _status(meta, cache) {
   if( cache.lastRead ) {
      return 'RESUME';
   }
   else if( !cache.updated ) {
      return 'INIT';
   }
   else if( meta.updated.diff(moment(cache.updated)) < 0 ) {
      return 'UPDATE';
   }
   else {
      return 'NOCHANGE';
   }
}

module.exports = Repo;

function _start(meta, conf) {
   //todo
   //todo
   //todo
   //todo
   //todo
}