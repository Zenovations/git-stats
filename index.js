
var fxns = require('./libs/fxns');
var StatsBuilder = require('./libs/StatsBuilder');
var defaults = require('./config.sample.js');
var _ = require('underscore');

// just compile the data and return it
exports.run = function(conf) {
   return StatsBuilder.load(_.extend({}, defaults, conf));
};

// compile, save, email, or print the results as conf tells us to
exports.auto = function(conf) {
   return fxns.autoRunStats(_.extend({}, defaults, conf));
};

