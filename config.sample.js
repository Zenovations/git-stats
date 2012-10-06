
module.exports = {
   // required: the account we're going to collect stats for
   user: 'github_username',

   // collect statistics such as how many lines of code, how many files, et al
   // this takes significantly more requests and cpu cycles, so if this information
   // isn't going to be used, set this to false
   deep: true,

   // how shall we output the data?
   format: 'json', // 'json', 'xml', or 'csv'

   // where shall we output it to?
   to: 'stdout',   // 'stdout', a writable file path, or 'email' (be sure to configure settings below)

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
         to: "receiver1@example.com, receiver2@example.com", // list of receivers
         subject: "[git-stats] stats failed"
      },

      smtp: {
         host: "smtp.gmail.com", // hostname
         secureConnection: true, // use SSL
         port: 465, // port for secure SMTP
         auth: {
            user: "gmail.user@gmail.com",
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

