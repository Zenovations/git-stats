
var Q       = require('q'),
    _       = require('underscore'),
    Gh      = require('github'),
    conf    = require('./config.js'),
    base64  = require('./base64.js'),
    email   = require("emailjs"),
    debug   = conf.debug;

var nodemailer = require("nodemailer");
var github = new Gh({version: '3.0.0'});
var RE = /^((?>[a-zA-Z\d!#$%&'*+\-/=?^_`{|}~]+\x20*|"((?=[\x01-\x7f])[^"\\]|\\[\x01-\x7f])*"\x20*)*(?<angle><))?((?!\.)(?>\.?[a-zA-Z\d!#$%&'*+\-/=?^_`{|}~]+)+|"((?=[\x01-\x7f])[^"\\]|\\[\x01-\x7f])*")@(((?!-)[a-zA-Z\d\-]+(?<!-)\.)+[a-zA-Z]{2,}|\[(((?(?<!\[)\.)(25[0-5]|2[0-4]\d|[01]?\d?\d)){4}|[a-zA-Z\d\-]*[a-zA-Z\d]:((?=[\x01-\x7f])[^\\\[\]]|\\[\x01-\x7f])+)\])(?(angle)>)$/;

/**
 * Override console output for simple debugging
 */
var _console = console;
var console = {
   log: function() {
      debug && _console.log.apply(_console, _.toArray(arguments));
   },
   warn: function() {
      debug && _console.warn.apply(_console, _.toArray(arguments));
   },
   error: function() {
      debug && _console.error.apply(_console, _.toArray(arguments));
   }
};

function fileStats(stats, filePath) {
   var def = Q.defer();

   var opts = {
      user: stats.owner,
      repo: stats.name,
      path: filePath
   };

   github.repos.getContent(opts, function(err, contents) {
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

function dirStats(stats, path) {
   var def = Q.defer();

   if( conf.deep ) {
      console.log(' + dir: ', stats.fullName, path);

      var opts = {
         user: stats.owner,
         repo: stats.name,
         path: path
      };

      github.repos.getContent(opts, function(err, files) {
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
                  promises.push(dirStats(stats, filePath));
               }
               else if( f.type == 'file' && (!conf.fileFilter || conf.fileFilter(f)) ) {
                  promises.push(fileStats(stats, filePath));
               }
            }
            Q.all(promises).then(function() {
               def.resolve();
            })
         }
      });
   }
   else {
      def.resolve();
   }

   return def.promise;
}

function readCommits(stats) {
   var opts = {repo: stats.name, user: stats.fullName.substr(0, stats.fullName.indexOf('/')), per_page: 100};
   return _accumulate('repos', 'getCommits', opts, true)
      .then(function(n) {
         stats.commits += n;
         return true;
      });
}

function readRepo(stats, repoData) {
   console.log('reading repo', repoData.full_name);
   var repoStats = stats[ repoData.name ] = {
      name: repoData.name,
      fullName: repoData.full_name,
      size: repoData.size,
      created: repoData.created_at,
      updated: repoData.updated_at,
      description: repoData.description,
      homepage: repoData.homepage,
      url: repoData.html_url,
      owner: repoData.owner.login || repoData.owner.name,
      watchers: repoData.watchers,
      issues: repoData.open_issues,
      forks: repoData.forks,
      files: 0,
      lines: 0,
      commits: 0,
      bytes: 0
   };
   return Q.all([ readCommits(repoStats), dirStats(repoStats, '') ]);
}

function processRepos(stats, repoList) {
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
   console.log('processOrg', org.login);
   var opts = {org: org.login};
   return _accumulate('repos', 'getFromOrg', opts).then(function(repoList) {
      return processRepos(stats, repoList);
   });
}

function processOrgs(stats, orgList) {
   var promises = [], i = orgList.length, org, p;
   while(i--) {
      promises.push(processOrg(stats, orgList[i]));
   }
   return Q.all(promises);
}

function sendEmail(to, message) {
   var p = conf.email.protocol;
   var smtpTransport = nodemailer.createTransport(p, conf.email[p]);

   // setup e-mail data with unicode symbols
   var mailOptions = _.extend({to: to}, conf.email.sendOptions, (typeof(message)==='string'? {text: message} : message));

   // send mail with defined transport object
   smtpTransport.sendMail(mailOptions, function(error, response){
      if(error){
         console.log(error);
      }else{
         console.log("Message sent: " + response.message);
      }

      //if you don't want to use this transport object anymore, uncomment following line
      smtpTransport.close(); // shut down the connection pool, no more messages
   });
}

function _accumulate(apiGroup, fxName, opts, countOnly, accumulatedData) {
   opts = _.extend({}, {per_page: 100}, opts);
   countOnly || (countOnly = false);
   accumulatedData || (accumulatedData = countOnly? 0 : []);
//   console.log('accumulating', apiGroup+'.'+fxName, opts);
   return Q.ninvoke(github[apiGroup], fxName, opts).then(function(list) {
      if( countOnly ) { accumulatedData += list.length; }
      else if( list ) { accumulatedData = accumulatedData.concat(list); }
      if( list && list.length == opts.per_page ) {
         opts.page = opts.page? opts.page + 1 : 2;
         return _accumulate(apiGroup, fxName, opts, countOnly, accumulatedData);
      }
      else {
//         console.log('accumulated '+(typeof(accumulatedData)==='number'? accumulatedData : accumulatedData.length));
         return accumulatedData;
      }
   });
}

var stats = {};

Q.all([
      Q.ninvoke(github.repos, 'getFromUser', {user: conf.user}) //todo use accumulate
         .then(function(list) {
            return processRepos(stats, list);
         }),
      Q.ninvoke(github.orgs, 'getFromUser', {user: conf.user}) //todo use accumulate
         .then(function(list) {
            return processOrgs(stats, list);
         })
   ])
   .then(function() {
      var out;
      switch(conf.format) {
         case 'json':
            out = conf.compress? JSON.stringify(stats) : JSON.stringify(stats, null, 2);
            break;
         case 'xml':
            var jsonxml = require('jsontoxml');
            out = jsonxml({stats: stats}, {escape: true, xmlHeader: true});
            conf.compress || (out = require('pretty-data').pd.xml(out));
            break;
         case 'csv':
            var json2csv = require('json2csv'), data = _.toArray(stats);
            out = json2csv.parse({
               data: data,
               fields: data.length? _.keys(data[0]) : []
            });
            break;
         default:
            throw new Error('invalid output format: '+conf.format);
      }

      if( conf.to === 'stdout' ) {
         process.stdout.write(out+"\n");
      }
      else if( RE.test(conf.to) ) {
         sendEmail(conf.to, {text: 'see attached', attachments: [
            { fileName: 'stats.'+conf.format, contents: out }
         ]});
         console.log('email delivered', conf.to);
      }
      else {
         //todo
         throw new Error('file output format not implemented yet');
      }
   })
   .fail(function(e) {
      if( conf.send_errors_to ) {
         sendEmail(conf.send_errors_to, e.stack);
      }
      console.error(e.stack);
   });

