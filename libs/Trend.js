
var fxns   = require('./fxns.js'),
     _     = require('underscore'),
    moment = require('moment');

function Trend(statKeys, formats, intervals, normalizedCache) {
   normalizedCache || (normalizedCache = {});
   this.data = {};
   this.stats = statKeys;
   _.each(this.stats, _.bind(function(key) {
      this.data[key] = new Stat(key, formats[key], intervals, normalizedCache[key]);
   }, this));
}
module.exports = Trend;

Trend.prototype.acc = function(when, changes) {
   _.each(_.intersection(_.keys(changes), this.stats), _.bind(function(key) {
//      console.log('acc', key, ~~changes[key]);
      this.data[key].acc(when, ~~changes[key]);
   }, this));
};

Trend.prototype.toJSON = function() {
   return this.data;
};

Trend.prototype._cache = function() {
   return fxns.cacheFormat(this.data);
};

function Stat(key, format, intervals, normalizedCache) {
   this.type = key;
   this.intervals = intervals;
   this.data = buildTrends(intervals, normalizedCache);
   this.format = format;
}

Stat.prototype.acc = function(when, amt) {
   _.each(this.intervals, _.bind(function(dateKeys, units) {
      var stat = fxns.getTrendByKey(fxns.intervalKey(when, units), dateKeys, this.data[units]);
      if( stat ) {
         stat._c++;
         stat.net += amt;
         stat.avg = Math.round(stat.net / stat._c);
      }
   }, this));
};

Stat.prototype.toJSON = function() {
   //todo this could be optimized by attaching the "formatter" to Trend, Repo, or even StatsBuilder, that way each Stat
   //todo doesn't have to generate its own formatting mechanism
   return formatStat(this.format, this.data);
};

Stat.prototype._cache = function() {
   return this.data;
};

function buildTrends(intervals, normalizedCache) {
   var out = {};
   _.each(intervals, function(dateKeys, units) {
      out[units] = _interval(dateKeys.length, normalizedCache[units]);
   });
   return out;
}

function _interval(increments, normalizedCache) {
   var out = [], i = increments;
   while(i--) {
      out[i] = _.extend({net: 0, avg: 0, _c: 0}, normalizedCache[i]||{});
   }
   return out;
}

function formatStat(format, data) {
   var out = {}, fx = _formatter(format);
   _.each(data, function(values, units) {
      out[units] = fx(values);
   });
   return out;
}

function _formatter(format) {
   switch(format) {
      case 'raw':
         return function(values) { return _.map(values, function(v) { return _.pick(v, 'avg', 'net'); }); };
      case 'net':
      case 'avg':
         return function(values) { return _.pluck(values, format); };
         break;
      default:
         throw new Error('Invalid conf::trends.format '+format);
   }
}