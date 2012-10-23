
var Q          = require('q'),
    _          = require('underscore'),
    conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js'),
    sb         = require('./libs/StatsBuilder.js'),
    util       = require('util'),
    logger    = fxns.logger();

sb.load(conf)
      .then(function(stats) {
//         logger.info(fxns.removeZeroTrends({stats: JSON.parse(stats.getStats(conf.format, conf.compress)), trends: JSON.parse(stats.getTrends(conf.format, conf.compress))}));
//         logger.info(stats.cache);
         logger.debug(util.inspect({stats: JSON.parse(stats.getStats(conf.format, conf.compress)), trends: JSON.parse(stats.getTrends(conf.format, conf.compress))}, false, 10, true));
      })
      .fail(function(e) {
         logger.error(e);
         logger.error(e.stack);
         throw e;
      });
