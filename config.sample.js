
var USER = 'github_username';

module.exports = {
   // required: the account we're going to collect stats for
   user: USER,

   // Optional, but without a password, GitHub limits API calls to 60 per hour; it's going to be pretty
   // rocky collecting stats on any sizable project with only 60 requests. Generally you'll want a password.
   // But small repos or aggressive filtering may work okay without.
   // We can't see private repositories unless we log in.
   pass: null,

   // how shall we output the data? when this is set to csv, it only outputs trends (or static if trends is disabled)
   // and never outputs both as this would not make any organizational sense
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to? this can be 'stdout', an email address, or a filename
   to: 'stdout',                         // print to console
   //to: './github-stats-'+USER+'.json', // output to a file
   //to: 'user@gmail.com',               // send results via email

   // setting this to false will add returns/indentation for human readability
   compress: true,

   // this caches all stats so that only repos/files modified since we last collected stats are read
   // it can be turned off by setting this to a falsy value, but that will greatly increase overhead
   // and make it much more likely to exceed the GitHub API rate limits
   cache_file: '/tmp/github-stats-'+USER+'.cache.json',

   // controls stats collected for each repository as of today; does not include any historical data for comparison
   // watchers, issues, and forks are essentially free (one request per repo), the other items configurable here come
   // with some overhead to retrieve
   static: {
      // number of githubbers watching the repo (no additional requests)
      watchers: true,

      // number of open issues for the repo (no additional requests)
      issues: true,

      // number of repository forks (no additional requests)
      forks: true,

      // number of commits submitted to the repo (roughly one request per 100 commits)
      commits: true,

      // number of files in the repo (one request per commit)
      files: true,

      // total bytes in the repo (one request per commit)
      bytes: true,

      // total lines of code in the repo (one request per commit)
      lines: true,

      // cumulative number of lines added for all commits (one request per commit)
      adds: true,

      // cumulative number of lines deleted for all commits (one request per commit)
      deletes: true
   },

   // Calculates the `net` (the delta or sum) and `avg` (average for the period) for each `interval` (time period),
   // useful for comparisons (make pretty charts!). Note that the `net` doesn't make sense for repo level datum
   // (e.g. watchers, forks, issues), but it is part of the necessary cache data for compiling these averages.
   //
   // The calculations are done at the same time as the static and averages, so there is only a small overhead
   // to calculate the additional figures, however, this greatly increases the storage size and memory usage
   // (although they should still be practical for most reasonable cases--see the README for estimations)
   trends: {

      // setting this to false will turn off historical data and make people who like analytics very sad
      active: true,

      // setting this to false removes historical data for each repo (just store totals) which significantly
      // reduces the output file size (divide file size by the number of repos plus one for an estimate)
      repos: true,

      collect: {
         // delta of githubbers watching the repo (no additional requests)
         watchers: true,

         // delta of open issues for the repo (no additional requests)
         issues: true,

         // delta of repository forks (no additional requests)
         forks: true,

         // delta of commits submitted to the repo (roughly one request per 100 commits)
         commits: true,

         // delta of files in the repo (one request per commit)
         files: true,

         // delta bytes in the repo (one request per commit)
         bytes: true,

         // delta lines of code in the repo (one request per commit)
         lines: true,

         // cumulative number of lines added for all commits (one request per commit)
         adds: true,

         // cumulative number of lines deleted for all commits (one request per commit)
         deletes: true
      },

      // specify periods and number of entries to create
      // valid keys are 'year', 'month', 'week', or 'day' and stats can be accumulated
      // over any of these intervals for any distance (the only limit is memory and cpu cycles)
      // add all the intervals together and multiply it by the number of commits + files for a figure on
      // how many entries will be created in the trends data
      intervals: {
         years: 10,
         months: 12,
         weeks: 25,
         days: 30
      },

      // What calculation do we put into the output?
      //
      // "net" refers to the cumulative total of all samples obtained and is generally useful for commit actions
      // "avg" refers to the total divided by the number of samples (the average of all samples over this period)
      // "raw" creates an object in the format { net: ##, avg: ## }
      //
      // In general, all stats obtained per commit make the most sense as a cumulative total (if 3 files are
      // deleted today, todays value will be 3 less than yesterday) rather than an average (today's value is the
      // average number of files added today)
      //
      // Stats obtained per repo generally make no sense if done as a net and should use "avg"
      // (the number of open issues this month is the average of all samples taken rather than the cumulative
      //  total of all samples)
      format: {
         watchers: 'avg',
         issues: 'avg',
         forks: 'avg',
         commits: 'net',
         files: 'net',
         bytes: 'net',
         lines: 'net',
         adds: 'net',
         deletes: 'net'
      }

   },

   filters: {

      /**
       * Only organizations for which this method returns true are tracked, to disable this filter, set this to false
       * @param org
       * @return {Boolean}
       */
      org: function(org) {
         return org.login && !org.login.match(/^[._~-]/);
      },

      /**
       * Only repos for which this function returns true are tracked, to disable this filter, set this to false
       * @param {object} repo the data straight from GitHub's repos API
       * @return {boolean}
       */
      repo: function(repo) {
         return !repo.fork && !repo.name.match(/^[._~-]/) && !repo.private;
      },

      /**
       * Only files for which this function returns true are tracked, this affects all statistics related to
       * files (number of files, bytes, lines of code). file.filename contains the relative path to the repo root
       *
       * @param {object} file data straight from GitHub's collect API
       * @return {Boolean}
       */
      file: function(file) {
         var parts = file.filename.split('/'),
             dirs = parts.length > 1? parts.slice(0, -1) : [],
             name = parts.slice(-1)[0],
             i = dirs.length,
             badDir = false;

         while(i-- && !badDir) {
            var dir = dirs[i];
            badDir = dir.match(/^[._]/)                  // directory doesn't start with . or _
                   || dir in {node_modules: 1, dist: 1}; // directory is not node_modules/ or dist/
         }

         // filename doesn't start with . or _ or end with ~ or -
         return !badDir && !name.match(/^[._]/) && !name.match(/[~-]$/);
      }

   },

   // true to send email on any error (be sure to configure settings below)
   report_errors: true,

   // configure if `report_errors` is true or if `to` is email
   email: {
      // 'smtp', or 'sendmail'
      protocol: 'smtp',

      sendOptions: {
         from: "Sender Name <sender@example.com>", // sender address
         to: "receiver1@example.com, receiver2@example.com", // recipients for error messages
         subject: "[git-stats] error occurred for "+USER
      },

      smtp: {
         host: "smtp.gmail.com", // hostname
         secureConnection: true, // use SSL
         port: 465, // port for secure SMTP
         auth: {
            user: "user@gmail.com",
            pass: "userpass"
         }
      },

      sendmail: {
         path: "/usr/local/bin/sendmail",
         args: ["-f sender@example.com"]
      }
   }

};

