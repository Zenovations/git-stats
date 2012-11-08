
var conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js'),
    sb         = require('./libs/StatsBuilder.js'),
    util       = require('util'),
    logger     = fxns.logger();

sb.load(conf)
      .then(function(stats) {
         var data = stats.format(conf.format, conf.compress);
         switch(fxns.outputType(conf.to)) {
            case 'stdout':
               // don't use logger here; it must get printed
               console.log(data && typeof(data) === 'object'? util.inspect(data, false, 10, true) : data);
               break;
            case 'email':
               fxns.sendEmail(conf.to, {
                  message: '[git-stats] stats for '+conf.user,
                  attachments: [
                     { fileName: 'git-stats-'+conf.user+'.'+conf.format, contents: data }
                  ]
               }, conf);
               break;
            case 'file':
               fxns.writeFile(conf.to, data);
               break;
            default:
               console.error('Invalid output destination (not stdout, an email address, or a file path)', conf.to);
         }
      })
      .fail(function(e) {
         if( conf.send_errors_to ) {
            fxns.sendEmail(conf.send_errors_to, e.stack || e, conf);
         }
         logger.error(e.stack || e);
      });
