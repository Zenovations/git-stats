
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

var VALID_EMAIL = /((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?/;

fxns.hookToConsoleDotLog(conf.debug);

Q.all([
      Q.ninvoke(github.repos, 'getFromUser', {user: conf.user}) //todo use accumulate
         .then(function(list) {
            return fxns.processRepos(stats, list);
         }),
      Q.ninvoke(github.orgs, 'getFromUser', {user: conf.user}) //todo use accumulate
         .then(function(list) {
            return fxns.processOrgs(stats, list);
         })
   ])
   .then(function() {
      var out;
      switch(conf.format) {
         case 'json':
            out = conf.compress? JSON.stringify(stats) : JSON.stringify(stats, null, 2);
            break;
         case 'xml':
            out = fxns.toXml(stats, conf.compress);
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
      else if( VALID_EMAIL.test(conf.to) ) {
         fxns.sendEmail(conf.to, {
            text: 'see attached',
            subject: '[git-stats] stats for '+conf.user,
            attachments: [
               { fileName: 'stats.'+conf.format, contents: out }
            ]
         });
         console.log('email delivered', conf.to);
      }
      else {
         //todo
         throw new Error('file output format not implemented yet');
      }
   })
   .fail(function(e) {
      if( conf.send_errors_to ) {
         fxns.sendEmail(conf.send_errors_to, e.stack);
      }
      console.error(e.stack);
   });

