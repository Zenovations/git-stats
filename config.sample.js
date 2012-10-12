
var USER = 'github_username';

module.exports = {
   // required: the account we're going to collect stats for
   user: USER,

   // how shall we output the data?
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to?
   to: 'stdout',                     // print to console
   //to: './github-stats-'+USER+'.json', // output to a file
   //to: 'user@gmail.com',           // send results via email

   // controls stats collected for each repository as of today; does not include any historical data for comparison
   // watchers, issues, and forks are essentially free, the items configurable here come with some overhead to retrieve
   static: {
      // count the number of commits submitted to the repo (requires roughly one request per 100 commits)
      commits: true,

      // count how many files are in the repo (requires one request per directory)
      files: true,

      // count total bytes of all files in the repo (requires one request per directory)
      bytes: true,

      // collect statistics on how many lines of code are in the repo (requires one request per file)
      lines: true,

      // accumulates add/delete/update info for each commit action (requires one request per commit)
      changes: true
   },

   // this is the historical data used for comparisons (make pretty charts!), the calculations are done at the same
   // time as the static stats, so there is only a small overhead to store the additional figures, however,
   // this greatly increases the cache size and memory usage (although they should still be practical for most
   // repositories)
   trends: {

      // setting this to false will turn off historical data and make people who like analytics very sad
      active: true,

      // setting this to false removes historical data for each repo (just store totals) which significantly
      // reduces the output file size (divide file size by the number of repos plus one for an estimate)
      repos: true,

      collect: {
         // count the number of commits submitted to the repo (requires roughly one request per 100 commits)
         commits: true,

         // count how many files are in the repo (requires one request per directory)
         files: true,

         // count total bytes of all files in the repo (requires one request per directory)
         bytes: true,

         // collect statistics on how many lines of code are in the repo (requires one request per file)
         lines: true,

         // accumulates add/delete/update info for each commit action (requires one request per commit)
         changes: true
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
      }
   },

   // this caches all stats so that only repos/files modified since we last collected stats are read
   // it can be turned off by setting this to a falsy value, but that will greatly increase overhead
   cache_file: '/tmp/github-stats-'+USER+'.cache.json',

   /**
    * Only repos for which this function returns true are tracked, to disable this filter, set this to false
    * @param {object} repo the data straight from GitHub's repos API
    * @return {boolean}
    */
   repoFilter: function(repo) {
      return !repo.fork && !repo.name.match(/^[._~-]/);
   },

   /**
    * Only directories for which this function returns true are tracked, this affects all statistics related to
    * files (number of files, bytes, lines of code)
    *
    * @param {object} dir the data straight from GitHub's collect API
    * @return {Boolean}
    */
   dirFilter: function(dir) {
      return !dir.name.match(/^[._]/) && !(dir.name in {lib: 1, ext: 1, node_modules: 1, dist: 1});
   },

   /**
    * Only files for which this function returns true are tracked, this affects all statistics related to
    * files (number of files, bytes, lines of code)
    *
    * @param {object} file data straight from GitHub's collect API
    * @return {Boolean}
    */
   fileFilter: function(file) {
      return !file.name.match(/^[._]/) && !file.name.match(/[~-]$/);
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
   compress: true,

   // setting this to true generates lots of logging to stdout
   debug: false

};

