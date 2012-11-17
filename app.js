/**
 * Command line utility to invoke git-stats using a cron job or other tool
 */

var conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js');

// run the git-stats accumulator and email/file/output results according to config.js
fxns.autoRunStats(conf);
