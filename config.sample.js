
var USER = 'github_username';

module.exports = {
   // required: the account we're going to collect stats for
   user: USER,

   // Optional, but without a password, GitHub limits API calls to 60 per hour; it's going to be pretty
   // rocky collecting stats on any sizable project with only 60 requests. Generally you'll want a password.
   // But small repos or aggressive filtering may work okay without.
   // We can't see private repositories unless we log in.
   pass: null,

   // how shall we output the data?
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to?
   to: 'stdout',                     // print to console
   //to: './github-stats-'+USER+'.json', // output to a file
   //to: 'user@gmail.com',           // send results via email

   // controls stats collected for each repository as of today; does not include any historical data for comparison
   // watchers, issues, and forks are essentially free (one request per repo), the other items configurable here come
   // with some overhead to retrieve
   static: {
      // number of githubbers watching the repo (requires no additional requests)
      watchers: true,

      // number of open issues for the repo (requires no additional requests)
      issues: true,

      // number of repository forks (requires no additional requests)
      forks: true,

      // number of commits submitted to the repo (requires roughly one request per 100 commits)
      commits: true,

      // number of files in the repo (requires two requests per commit)
      files: true,

      // total bytes in the repo (requires two requests per commit)
      bytes: true,

      // total lines of code in the repo (requires two requests per commit)
      lines: true,

      // cumulative number of lines added for all commits (requires two requests per commit)
      adds: true,

      // cumulative number of lines deleted for all commits (requires two requests per commit)
      deletes: true
   },

   // This is the delta (change over time) used for comparisons (make pretty charts!). It can also include averages
   // for each interval recorded.
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
         // delta of githubbers watching the repo (requires no additional requests)
         watchers: true,

         // delta of open issues for the repo (requires no additional requests)
         issues: true,

         // delta of repository forks (requires no additional requests)
         forks: true,

         // delta of commits submitted to the repo (requires roughly one request per 100 commits)
         commits: true,

         // delta of files in the repo (requires two requests per commit)
         files: true,

         // delta bytes in the repo (requires two requests per commit)
         bytes: true,

         // delta lines of code in the repo (requires two requests per commit)
         lines: true,

         // cumulative number of lines added for all commits (requires two requests per commit)
         adds: true,

         // cumulative number of lines deleted for all commits (requires two requests per commit)
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

      // if true, averages are also stored for each stat in `collect`, in addition to the changes
      // over each time period, see README for details on the cost of this (it's very low)
      averages: true
   },

   // this caches all stats so that only repos/files modified since we last collected stats are read
   // it can be turned off by setting this to a falsy value, but that will greatly increase overhead
   cache_file: '/tmp/github-stats-'+USER+'.cache.json',

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
       * Only directories for which this function returns true are tracked, this affects all statistics related to
       * files (number of files, bytes, lines of code)
       *
       * @param {object} dir the data straight from GitHub's collect API
       * @return {Boolean}
       */
      dir: function(dir) {
         return !dir.name.match(/^[._]/) && !(dir.name in {lib: 1, ext: 1, node_modules: 1, dist: 1});
      },

      /**
       * Only files for which this function returns true are tracked, this affects all statistics related to
       * files (number of files, bytes, lines of code)
       *
       * @param {object} file data straight from GitHub's collect API
       * @return {Boolean}
       */
      file: function(file) {
         return !file.name.match(/^[._]/) && !file.name.match(/[~-]$/);
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
   },

   // setting this to false will add formatting (returns, indentation) to the outputted data for human readability
   compress: true

};

