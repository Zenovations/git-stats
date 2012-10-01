
var Q      = require('q'),
    gh     = require('octonode'),
    conf   = require('./config.js'),
    client = gh.client(conf);

//var ghme   = client.me();
//var ghuser = client.user('pksunkara');
//var ghrepo = client.repo('pksunkara/hub');
//var ghorg  = client.org('flatiron');
//var ghgist = client.gist();
//var ghteam = client.team(37);

function fileStats(stats, filePath) {

}

function dirStats(stats, path) {
   var def = Q.defer();
   console.log('dirStats', stats.fullName, path);
   client.repo(stats.fullName).contents(path, function(err, files) {
      if( err ) {
         console.log('error in dirStats', stats.fullName, path);//debug
         def.reject(err);
      }
      else {
         stats.files += files.length;
         def.resolve();
      }
   });
   return def.promise;
}

function readRepo(stats, repoData) {
   var thisRepo = stats[ repoData.name ] = {
      name: repoData.name,
      fullName: repoData.full_name,
      size: repoData.size,
      created: repoData.created_at,
      updated: repoData.updated_at,
      description: repoData.description,
      homepage: repoData.homepage,
      url: repoData.html_url,
      files: 0,
      lines: 0,
      commits: 0,
      bytes: 0
   };
   return dirStats(thisRepo, '/');
}

function accumulateRepos(stats, repoList) {
   var i = -1, len = repoList? repoList.length : 0, promises = [];
   while(++i < len) {
      if( !repoList[i].fork && (!conf.repoFilter || conf.repoFilter(repoList[i])) ) {
         promises.push(readRepo(stats, repoList[i]));
      }
   }
   return Q.all(promises);
}

function processOrg(stats, org) {
   var d = Q.defer();
   client.org(org.login).repos(function(err, repoList) {
      if( err ) {
         console.error(err);
      }
      else {
         accumulateRepos(stats, repoList)
            .then(d.resolve)
            .fail(d.reject);
      }
   });
   return d.promise;
}

var user = client.me(), stats = {};

Q.ninvoke(user, 'repos')
   .then(function(list) {
      return accumulateRepos(stats, list);
   })
   .then(function() {
      return Q.ninvoke(user, 'orgs');
   })
   .then(function(list) {
      return processOrg(stats, list);
   })
   .then(
      function() { console.log('stats', stats); },
      function() { console.log('stats', stats); }
   )
   .fail(function(e) {
      console.error(e);
   });

