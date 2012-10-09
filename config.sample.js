
var USER = 'github_username';

module.exports = {
   // required: the account we're going to collect stats for
   user: USER,

   // collect statistics such as how many lines of code, how many files, et al
   // this takes significantly more requests and cpu cycles, so if this information
   // isn't going to be used, set this to false
   deep: true,

   // how shall we output the data?
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to?
   to: 'stdout',                     // print to console
   //to: '/file/path/filename.json', // output to a file
   //to: 'user@gmail.com',           // send results via email

   // used when `update_only` is true and `to` is not a file; this caches the last update time (the last time we checked
   // repos and files for changes) so that only files modified since we collected stats are read from GitHub
   cache_file: '/tmp/git-stats.cache.json',

   // setting this to false will add formatting (returns, indentation) to the outputted data
   compress: true,

   // comment this out (or `return true`) to generate stats for all repos
   repoFilter: function(repo) {
      return !repo.fork && repo.name.match(/^[._~-]/);
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

   // setting this to true generates lots of logging to stdout
   debug: false

};

