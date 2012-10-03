
var Q      = require('q'),
    _      = require('underscore'),
    gh     = require('octonode'),
    conf   = require('./config.js'),
    client = gh.client(conf),
    base64 = require('./base64.js');

//var ghme   = client.me();
//var ghuser = client.user('pksunkara');
//var ghrepo = client.repo('pksunkara/hub');
//var ghorg  = client.org('flatiron');
//var ghgist = client.gist();
//var ghteam = client.team(37);

function fileStats(stats, filePath, repo) {
   var def = Q.defer();
   repo.contents(filePath, function(err, contents) {
      if( err ) {
         console.error('ERROR (fileStats)', err);
         console.log(err);
         def.reject(err);
      }
      else {
         console.log('    > file: ', filePath.substr(Math.max(filePath.lastIndexOf('/'), 0)));
         var decodedContent = base64.decode(contents.content);
         stats.lines += decodedContent.split("\n").length;
         stats.files++;
         stats.bytes += contents.size;
         def.resolve();
      }
   });
   return def.promise;
}

function dirStats(stats, path, repo) {
   var def = Q.defer();
   console.log(' + dir: ', stats.fullName, path);
   if( !repo ) { repo = client.repo(stats.fullName); }

   repo.contents(path, function(err, files) {
      if( err ) {
         console.error('ERROR (dirStats)', stats.fullName, path);
         def.reject(err);
      }
      else {
         var promises = [], i = -1, len = files.length, filePath, f;
         while(++i < len) {
            f = files[i];
            filePath = f.path;
            if( f.type == 'dir' && (!conf.dirFilter || conf.dirFilter(f)) ) {
               promises.push(dirStats(stats, filePath, repo));
            }
            else if( f.type == 'file' && (!conf.fileFilter || conf.fileFilter(f)) ) {
               promises.push(fileStats(stats, filePath, repo));
            }
         }
         Q.all(promises).then(function() {
            console.log('all dirStats promises resolved', path);
            def.resolve();
         })
      }
   });

   return def.promise;
}

function readCommits(stats, repo) {
   var def = Q.defer();
   repo.commits(function(err, commits) {
      if( err ) {
         def.reject(err);
      }
      else {
         stats.commits = commits.length;
         def.resolve();
      }
   });
   return def.promise;
}

function readRepo(stats, repoData) {
   console.log('REPO: ', repoData.name);
   var repo = client.repo(repoData.full_name), repoStats = stats[ repoData.name ] = {
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
   return Q.all([ readCommits(repoStats, repo), dirStats(repoStats, '', repo) ]);
}

function accumulateRepos(stats, repoList) {
   if( conf.repoFilter ) {
      repoList = _.filter(repoList, conf.repoFilter);
   }
   var promises = [], i = repoList.length;
   while(i--) {
      promises.push(readRepo(stats, repoList[i]));
   }
   return Q.all(promises);
}

function processOrg(stats, org) {
   var deferred = Q.defer();
   console.log("------------\nORG: "+ org.login + "\n------------");
   client.org(org.login).repos(function(err, repoList) {
      if( err ) {
         deferred.reject(err);
      }
      else {
         accumulateRepos(stats, repoList)
            .then(deferred.resolve)
            .fail(deferred.reject);
      }
   });
   return deferred.promise;
}

function processOrgs(stats, orgList) {
   var promises = [], i = orgList.length, org, p;
   while(i--) {
      promises.push(processOrg(stats, orgList[i]));
   }
   return Q.all(promises);
}

var user = client.me(), stats = {};

Q.all(
      Q.ninvoke(user, 'repos')
         .then(function(list) {
            console.log("------------\nUSER: "+ conf.username +"\n------------");
            return accumulateRepos(stats, list);
         }),
      Q.ninvoke(user, 'orgs')
         .then(function(list) {
            return processOrgs(stats, list);
         })
   )
   .then(
      function() { console.log('stats', stats); }
   )
   .fail(function(e) {
//      console.error(e.toString());
      console.error(e.stack);
   });

