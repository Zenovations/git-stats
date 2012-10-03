
module.exports = {
   username: 'github_user',
   password: 'github_pass',
   email:    'notified on errors',
   repoFilter: function(repo) {
      return !repo.fork && repo.name.match(/^[._~-]/);
   },
   dirFilter: function(dir) {
      return !dir.name.match(/^[._~-]/) && !(dir.name in {lib: 1, libs: 1});
   },
   fileFilter: function(file) {
      return !file.name.match(/^[._~-]/);
   }
};

