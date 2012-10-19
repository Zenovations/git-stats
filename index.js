
var StatsBuilder = require('./libs/StatsBuilder');
var defaults = require('./config.sample.js');

exports.run = function(conf) {
   return StatsBuilder.load(_.extend({}, defaults, conf));
};

