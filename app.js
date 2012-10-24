
var Q          = require('q'),
    _          = require('underscore'),
    conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js'),
    sb         = require('./libs/StatsBuilder.js'),
    util       = require('util'),
    fs         = require('fs'),
    logger    = fxns.logger();

sb.load(conf)
      .then(function(stats) {
         logger.info(fxns.removeZeroTrends({stats: JSON.parse(stats.getStats(conf.format, conf.compress)), trends: JSON.parse(stats.getTrends(conf.format, conf.compress))}));
//         logger.info(stats.cache);
//         logger.info({stats: JSON.parse(stats.getStats(conf.format, conf.compress)), trends: JSON.parse(stats.getTrends(conf.format, conf.compress))});
         logger.info(_.pick(JSON.parse(stats.getTrends(conf.format, conf.compress)).total, 'watchers', 'forks', 'issues'),
                     _.pick(JSON.parse(stats.getTrends(conf.format, conf.compress)).repos['katowulf/git-stats'], 'watchers', 'forks', 'issues'));
      })
      .fail(function(e) {
         //todo deliver email on failure

         logger.error(e);
         logger.error(e.stack);
         throw e;
      });
