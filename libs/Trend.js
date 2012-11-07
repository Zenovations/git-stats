
var fxns   = require('./fxns.js'),
     _     = require('underscore'),
    moment = require('moment'),
    log    = fxns.logger();

function Trend(statKeys, intervals, normalizedCache) {
   normalizedCache || (normalizedCache = {});
   this.data = {};
   this.stats = statKeys;
   _.each(this.stats, _.bind(function(key) {
      this.data[key] = new Stat(key, intervals, normalizedCache[key]);
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

function Stat(key, intervals, normalizedCache) {
   this.type = key;
   this.intervals = _.keys(intervals);
   this.data = buildTrends(intervals, normalizedCache);
}

Stat.prototype.acc = function(when, amt) {
   _.each(this.intervals, _.bind(function(unit) {
      _inc(this.data[unit], fxns.intervalKey(when, unit), amt);
   }, this))
};

Stat.prototype.toJSON = function() {
   return this.data;
};

function _inc(interval, dateKey, amt) {
//   console.log('_inc', interval, dateKey, amt, interval[dateKey]);//debug
   if( interval && interval[dateKey] ) {
      var stat = interval[dateKey];
      stat._c++;
      stat.net += amt;
      stat.avg = Math.round(stat.net / stat._c);
   }
}


function buildTrends(intervals, normalizedCache) {
   var out = {};
   _.each(intervals, function(span, units) {
      out[units] = _interval(span, normalizedCache[units]);
   });
   return out;
}

function _interval(increments, normalizedCache) {
   var out = {}, i = increments;
   while(i--) {
      out[i] = _.extend({net: 0, avg: 0, _c: 0}, normalizedCache[i]);
   }
   return out;
}

