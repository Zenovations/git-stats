
//todo move logging config somewhere more configurable

//var opts = { transports: [] };
//conf.logging.stdout && opts.transports.push( new winston.transports.Console({colorize: true, prettyPrint: true, levels: levels}) );
//conf.logging.file && opts.transports.push( new winston.transports.File({ filename: conf.logging.file, timestamp: true, json: true, levels: levels }) );
var winston = require('winston');

module.exports = {
   transports: [
      new winston.transports.Console({colorize: true, prettyPrint: true, levels: levels('info')})
      //, new winston.transports.File({ filename: '/tmp/git-stats.log', timestamp: true, json: true, levels: levels('info') })
   ]
};

function levels(level) {
   var levels = [];
   // if you set an output level, winston only shows that level and not
   // all the ones higher in the list, so correct this as a convenience
   //noinspection FallthroughInSwitchStatementJS
   switch(level) {
      case 'debug':
         levels.push('debug');
      case 'info':
         levels.push('info');
      case 'warn':
         levels.push('warn');
      case 'error':
         levels.push('error');
      default:
         // nothing to do here
   }
   return levels;
}

