
var Q          = require('q'),
    _          = require('underscore'),
    conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js'),
    sb         = require('./libs/StatsBuilder.js'),
    util       = require('util');

if( !conf.debug ) {
   fxns.suppressLogs();
}

sb.load(conf)
      .then(function(stats) {
         console.log(util.inspect(fxns.removeZeroTrends({stats: JSON.parse(stats.getStats(conf.format, conf.compress)), trends: JSON.parse(stats.getTrends(conf.format, conf.compress))}), false, 10, true));
      })
      .fail(function(e) {
         console.error(e);
         console.error(e.stack);
         throw e;
      });

/**************
var stats = {
   lastUpdated: moment.utc().format(),
   user: conf.user,
   orgs: [],
   repos: {}
};

if( conf.collect.trends ) {
   stats.trends = {};
}

fxns.hookToConsoleDotLog(conf.debug);

Q.fcall(fxns.ready)
   .then(function() {
      return Q.all([
         Q.ninvoke(github.repos, 'getFromUser', {user: conf.user}) //todo use accumulate (could be more than 100)
            .then(function(list) {
               return fxns.processRepos(stats, list);
            }),
         Q.ninvoke(github.orgs, 'getFromUser', {user: conf.user}) //todo use accumulate (could be more than 100)
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

***********/