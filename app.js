
var Q       = require('q'),
    _u       = require('underscore'),
    Gh      = require('node-github'),
    conf    = require('./config.js'),
    base64  = require('./base64.js'),
    email   = require("emailjs");

function fileStats(stats, filePath, repo) {
   var def = Q.defer();
   repo.contents(filePath, function(err, contents) {
      if( err ) {
         console.error('ERROR (fileStats)', err);
         console.log(err);
         def.reject(err);
      }
      else {

         console.log('    > file: ', filePath);
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

function readCommits(stats) {
   return _accumulate('repos', 'getCommits', {repo: stats.name, user: stats.fullName.substr(0, stats.fullName.indexOf('/')), per_page: 2}, true).then(
      function(count) {
         console.log('the count', count);
         stats.commits = count;
      }
   );
}

function readRepo(stats, repoData) {
   var repoStats = stats[ repoData.name ] = {
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
   return Q.all([ readCommits(repoStats)/*, dirStats(repoStats)*/ ]);
}

function accumulateRepos(stats, repoList) {
   if( conf.repoFilter ) {
      repoList = _u.filter(repoList, conf.repoFilter);
   }
   var promises = [], i = repoList.length;
   while(i--) {
      promises.push(readRepo(stats, repoList[i]));
   }
   return Q.all(promises);
}

function processOrg(stats, org) {
   var opts = {org: org.login, per_page: 2};
   return _accumulate('repos', 'getFromOrg', opts).then(function(repoList) {
      console.log('processOrg', org, repoList);
      return accumulateRepos(stats, repoList);
   });
}

function processOrgs(stats, orgList) {
   var promises = [], i = orgList.length, org, p;
   while(i--) {
      promises.push(processOrg(stats, orgList[i]));
   }
   return Q.all(promises);
}

function sendEmail(subject, message) {
   if( conf.email && conf.smtp ) {
      // send the message and get a callback with an error or details of the message that was sent
      var server  = email.server.connect(conf.smtp);
      server.send({
         text:    message,
         from:    conf.email,
         to:      conf.email,
         subject: subject
      }, function(err, message) {
         if( err ) {
            console.error(err);
         }
         else {
            console.log("Email Delivered");
         }
         server.smtp.close();
      });
   }
}

function _accumulate(method, fxName, opts, countOnly, masterList) {
   console.log('accumulate', method, fxName, masterList && masterList.length);
   var count = 0, max = opts.per_page? opts.per_page : 30;
   masterList || (masterList = []);
   return Q.ninvoke(new Gh({version: '3.0.0'})[method], fxName, opts).then(function(list) {
      if( countOnly ) { count += list.length; }
      else { masterList = masterList.concat(list); }

      if( list && list.length == max ) {
         opts.page = opts.page? opts.page + 1 : 2;
         return _accumulate(method, fxName, opts, countOnly, masterList).then(function(n) {
            countOnly && (count += n);
         });
      }
      else {
         return Q.when(countOnly? count : masterList);
      }
   });
}

var stats = {};

Q.all([
      Q.ninvoke(new Gh({version: '3.0.0'}).repos, 'getFromUser', {user: conf.user})
         .then(function(list) {
            return accumulateRepos(stats, list);
         }),
      Q.ninvoke(new Gh({version: '3.0.0'}).orgs, 'getFromUser', {user: conf.user})
         .then(function(list) {
            return processOrgs(stats, list);
         })
   ])
   .then(
      function() { console.log(stats); }
   )
   .fail(function(e) {
      sendEmail('unable to generate stats', e.stack);
      console.error(e.stack);
   });

