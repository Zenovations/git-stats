
var fxns   = require('./fxns.js'),
     _     = require('underscore'),
    moment = require('moment'),
    log    = fxns.logger();

function Trend(stats, intervals, cache) {
   cache || (cache = {});
   this.data = {};
   this.stats = fxns.activeKeys(stats);
   _.each(this.stats, _.bind(function(key) {
      this.data[key] = new Stat(key, intervals, cache[key]);
   }, this));
}
module.exports = Trend;

Trend.prototype.acc = function(when, changes) {
   _.each(_.union(_.keys(changes), this.stats), _.bind(function(key) {
      this.data[key].acc(when, changes[key]);
   }, this));
};

Trend.prototype.toJSON = function() {
   return this.data;
};

function Stat(key, intervals, cache) {
   this.type = key;
   this.intervals = _.keys(intervals);
   this.data = buildTrends(intervals, cache);
}

Stat.prototype.acc = function(when, amt) {
   _.each(this.intervals, _.bind(function(unit) {
      var ds = fxns.intervalKey(when, unit);
      this.intervals[ds] && _inc(this.intervals[ds], amt);
   }, this))
};

Stat.prototype.toJSON = function() {
   return this.data;
};

function _inc(ds, amt) {
   ds._c++;
   ds.net += amt;
   ds.avg = Math.round(ds.net / ds._c);
}


function buildTrends(intervals, cached) {
   var out = {};
   _.each(intervals, function(v, k) {
      out[k] = _interval(k, v, cached);
   });
   return out;
}

function _interval(units, span, cached) {
   var out = {}, cache = cacheForTrend(cached, units), i = span;
   while(i--) {
      var d = moment.utc(), res;
      if( i > 0 ) { d.subtract(units, i); }
      var ds = fxns.intervalKey(d, units);
      out[ds] = _.extend({net: 0, avg: 0, _c: 0}, cache);
   }
   return out;
}

function cacheForTrend(cache, units) {
   return cache && cache[units]? cache[units] : {};
}

