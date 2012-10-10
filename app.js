
var Q          = require('q'),
    _          = require('underscore'),
    conf       = require('./config.js'),
    moment     = require('moment'),
    github     = new (require('github'))({version: '3.0.0'}),
    fxns       = require('./libs/fxns.js')(conf, github);

var stats = {
   lastUpdated: moment.utc().format(),
   user: conf.user,
   orgs: [],
   repos: {}
};

fxns.hookToConsoleDotLog(conf.debug);

Q.fcall(fxns.ready)
   .then(function() {
      return Q.all([
         Q.ninvoke(github.repos, 'getFromUser', {user: conf.user}) //todo use accumulate
            .then(function(list) {
               return fxns.processRepos(stats, list);
            }),
         Q.ninvoke(github.orgs, 'getFromUser', {user: conf.user}) //todo use accumulate
            .then(function(list) {
               return fxns.processOrgs(stats, list);
            })
         ])
   })
   .then(function() {
      var out, type = fxns.outputType(conf.to);
      switch(conf.format) {
         case 'json':
            out = conf.compress? JSON.stringify(stats) : JSON.stringify(stats, null, 2);
            break;
         case 'xml':
            out = fxns.toXml(stats, conf.compress);
            break;
         case 'csv':
            out = fxns.toCsv(stats);
            break;
         default:
            throw new Error('invalid output format: '+conf.format);
      }

      switch(type) {
         case 'stdout':
            process.stdout.write(out+"\n");
            break;
         case 'email':
            fxns.sendEmail(conf.to, {
               text: 'see attached',
               subject: '[git-stats] stats for '+conf.user,
               attachments: [
                  { fileName: 'stats.'+conf.format, contents: out }
               ]
            });
            console.log('email delivered', conf.to);
            break;
         case 'file':
            fxns.writeFile(conf.to, out);
            break;
         default:
            throw new Error('invalid output type', type);
      }

      fxns.cache(stats);
   })
   .fail(function(e) {
      if( conf.send_errors_to ) {
         fxns.sendEmail(conf.send_errors_to, e.stack);
      }
      console.error(e.stack);
   });

