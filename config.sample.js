
module.exports = {
   username: 'github_user',
   password: 'github_pass',
   repoFilter: function(repo) {
      return !repo.fork && repo.name.match(/^[._-~]/);
   },
   fileFilter: function(filename) {
      return !filename.match(/^[._-~]/);
   },
   portfolioFilter: function(repo) {
      return repo.full_name.indexOf('_') !== 0;
   }
};

