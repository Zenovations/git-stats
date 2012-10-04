
module.exports = {
   // required: the account we're going to collect stats for
   user: 'github_username',

   // uncomment and configure to get an email any time an error occurs
   //email:    'your@email.com',

   // if `email` is uncommented, this is the outgoing smtp server used
   smtp: {
      user:    "smtp_login (probably your email address)",
      password:"smtp_password (probably your email password)",
      host:    "smtp.gmail.com",
      ssl:     true
   },

   // comment this out (or `return true`) to generate stats for all repos
   repoFilter: function(repo) {
      return !repo.fork && repo.name.match(/^[._~-]/);
   },

   // comment this out (or `return true`) to generate stats for all directories
   dirFilter: function(dir) {
      return !dir.name.match(/^[._]/) && !(dir.name in {lib: 1, libs: 1, node_modules: 1}); // ignore things like .ssh
   },

   // comment this out (or `return true`) to generate stats for all files
   fileFilter: function(file) {
      return !file.name.match(/^[._]/) && !file.name.match(/[~-]$/); // ignore things like .gitignore and .gitattributes, and backup.txt~
   }
};

