
module.exports = function(conf, github) {
   var VALID_EMAIL = /((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?/;

   var fxns = {},
         Q          = require('q'),
         _          = require('underscore'),
         base64     = require('./base64.js'),
         inflection = require('inflection'),
         moment     = require('moment'),
         util       = require('util'),
         nodemailer = require("nodemailer"),
         FS         = require('fs'),
         cache      = { repos: {}, lastUpdated: moment.utc().subtract('years', 99).format(), user: conf.user },
         readyDef   = readCache(conf.cache_file);

   readyDef.then(function(cacheData) {
      if( cacheData ) {
         if( cacheData.user == conf.user ) {
            console.log('parsed cache file, last updated: ', cacheData.lastUpdated);
            cache = cacheData;
         }
         else {
            console.log('cache data was for a different user--discarded');
         }
      }
      else {
         console.log('no cached data found', cacheData);
      }
   });

   /**
    * @return {promise}
    */
   fxns.ready = function() {
      return readyDef.promise;
   };


   /**
    * Override console output for simple debugging
    */
   fxns.hookToConsoleDotLog = function(print, callback) {
      var old_log = console.log;

      console.log = (function(write) {
         return function() {
            print && write.apply(console, arguments);
            callback && callback.apply(null, arguments);
         }
      })(console.log);

      return function() {
         console.log = old_log;
      }
   };

   fxns.toXml = function(stats, compress) {
      var statsCopy = JSON.parse(JSON.stringify(stats)); // quick and dirty deep copy
      var data2xml = require('data2xml');
      var out = data2xml('stats', prepArraysForXml(prepReposForXml(statsCopy)));
      compress || (out = require('pretty-data').pd.xml(out));
      return out;
   };

   fxns.toCsv = function(stats) {
      var json2csv = require('json2csv'), data = _.toArray(stats.repos);
      return json2csv.parse({
         data: data,
         fields: data.length? _.keys(data[0]) : []
      });
   };

   fxns.processRepos = function(stats, repoList) {
      if( conf.filters.repo ) {
         repoList = _.filter(repoList, conf.filters.repo);
      }
      var promises = [], i = repoList.length, last = moment.utc(cache.lastUpdated), name;
      while(i--) {
         name = repoList[i].name;
         if( !hasRepo(cache, name) || moment.utc(repoList[i].updated_at).diff(last) > 0 ) {
            promises.push(readRepo(stats.repos, repoList[i]));
         }
         else {
            console.log('up to date: ', repoList[i].full_name);
            stats.repos[name] = cache.repos[name];
         }
      }
      return Q.all(promises);
   };

   fxns.processOrgs = function(stats, orgList) {
      var promises = [], i = orgList.length;
      while(i--) {
         promises.push(processOrg(stats, orgList[i]));
      }
      return Q.all(promises);
   };

   fxns.sendEmail = function(to, message) {
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
   };


   /**
    * This is async! that's not an issue here, but could be if something depended on the cache
    * being written first before getting used.
    *
    * @param {object} stats
    */
   fxns.cache = function(stats) {
      if( conf.cache_file ) {
         FS.writeFile(conf.cache_file, JSON.stringify(stats), function (err) {
            if (err) throw err;
            console.log('stats cached in ', conf.cache_file);
         });
      }
   };

   fxns.writeFile = function(filename, data) {
      FS.writeFile(filename, data, function (err) {
         if (err) throw err;
         console.log('wrote stats to ', filename);
      });
   };

   fxns.outputType = function(to) {
      if( to === 'stdout' ) {
         return 'stdout';
      }
      else if( VALID_EMAIL.test(to) ) {
         return 'email';
      }
      else {
         return 'file';
      }
   };

   function prepArraysForXml(data) {
      if( _.isArray(data) ) {
         var i = data.length;
         while(i--) {
            if( _.isObject(data[i]) ) {
               prepArraysForXml(data[i]);
            }
            else if( data[i] === null ) {
               // https://github.com/appsattic/node-data2xml/issues/2
               data[i] = '';
            }
         }
      }
      else if( _.isObject(data) ) {
         for (var k in data) {
            if (data.hasOwnProperty(k) ) {
               if( data[k] === null ) {
                  // https://github.com/appsattic/node-data2xml/issues/2
                  data[k] = '';
               }
               else if( _.isArray(data[k]) ) {
                  var v = data[k];
                  data[k] = {};
                  data[k][ inflection.singularize(k) ] = prepArraysForXml(v);
               }
               else if(_.isObject(data[k]) ) {
                  prepArraysForXml(data[k]);
               }
            }
         }
      }
      return data;
   }

   function prepReposForXml(stats) {
      if( _.isObject(stats.repos) ) {
         var arr = [];
         for (var k in stats.repos) {
            if (stats.repos.hasOwnProperty(k)) {
               arr.push(_.extend({ _attr: {name: k} }, stats.repos[k]));
            }
         }
         stats.repos = arr;
      }
      return stats;
   }

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

      if( conf.collect.files ) {
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
                  if( f.type == 'dir' && (!conf.filters.dir || conf.filters.dir(f)) ) {
                     promises.push(dirStats(stats, filePath));
                  }
                  else if( f.type == 'file' && (!conf.filters.file || conf.filters.file(f)) ) {
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

   function readRepo(repos, repoData) {
      console.log('reading: ', repoData.full_name);
      var repoStats = repos[ repoData.name ] = {
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

   function processOrg(stats, org) {
      console.log('processOrg', org.login);
      stats.orgs.push(org.login);
      var opts = {org: org.login};
      return _accumulate('repos', 'getFromOrg', opts).then(function(repoList) {
         return fxns.processRepos(stats, repoList);
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

   function readCache(cacheFileName) {
      if( cacheFileName && FS.existsSync(cacheFileName) ) {
         return Q.ninvoke(FS, 'readFile', cacheFileName, 'utf-8').then(function(data) {
            return data? JSON.parse(data) : null;
         });
      }
      else {
         return Q.fcall(function() { return false; });
      }
   }

   function upToDate(lastUpdate, utcString) {
      return moment.utc(utcString).diff(lastUpdate) <= 0;
   }

   function hasRepo(cache, name) {
      return cache && cache.repos && _.isObject(cache.repos[name]);
   }

   return fxns;
};
