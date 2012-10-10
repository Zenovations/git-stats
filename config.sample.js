
var USER = 'github_username';

module.exports = {
   // required: the account we're going to collect stats for
   user: USER,

   collect: {

      // collect statistics such as how many lines of code, and how many files
      // this requires iterating all the files in a repo so turn it off if that info isn't useful
      files: true,

      // accumulates all repo data (commits, bytes, watchers, etc) for the last 30 days/weeks/months/years
      // allowing it to be graphed over time
      trends: true

   },

   // how shall we output the data?
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to?
   to: 'stdout',                     // print to console
   //to: './github-stats-'+USER+'.json', // output to a file
   //to: 'user@gmail.com',           // send results via email

   // this caches all stats so that only repos/files modified since we last collected stats are read
   // it can be turned off by setting this to a falsy value, but that will greatly increase overhead
   cache_file: '/tmp/github-stats-'+USER+'.cache.json',


   // comment this out (or `return true`) to generate stats for all repos
   repoFilter: function(repo) {
      return !repo.fork && !repo.name.match(/^[._~-]/);
   },

   // comment this out (or `return true`) to generate stats for all directories
   dirFilter: function(dir) {
      return !dir.name.match(/^[._]/) && !(dir.name in {lib: 1, libs: 1, node_modules: 1}); // ignore things like .ssh, lib/, and node_modules (included libs)
   },

   // comment this out (or `return true`) to generate stats for all files
   fileFilter: function(file) {
      return !file.name.match(/^[._]/) && !file.name.match(/[~-]$/); // ignore things like .gitignore and .gitattributes, and backup.txt~
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

