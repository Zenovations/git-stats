
var data2xml    = require('data2xml');
var json2csv    = require('json2csv');
var inflection  = require('inflection');
var FS          = require('fs');
var moment      = require('moment');
var Q           = require('q');
var _           = require('underscore');
var base64      = require('./base64.js');
var util        = require('util');
var nodemailer  = require("nodemailer");
var log         = prepLogger();
var undef;

var VALID_EMAIL = /((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?/;

var fxns = exports;

fxns.logger = function(conf) {
   if( conf || !log ) { log = prepLogger(conf); }
   return log;
};

/**
 * Examines `to` to decide if it's a file path, email address, or 'stdout'
 * @param to
 * @return {String}
 */
fxns.outputType = function(to) {
   if( to === 'stdout' ) {
      return 'stdout';
   }
   else if( VALID_EMAIL.test(to) ) {
      return 'email';
   }
   else {
      return 'file';
   }
};

/**
 * Given a list of intervals (see config.sample.js->collect.intervals), calculate the start dates of each
 * and return the oldest.
 *
 * @param {object} intervals
 * @return {moment}
 */
fxns.oldestInterval = function(intervals) {
   var oldestInterval = null;
   for(var k in intervals) {
      if( intervals.hasOwnProperty(k) ) {
         var d = moment.utc().subtract(k, intervals[k]);
         if( !oldestInterval || d.diff(oldestInterval) < 0 ) {
            oldestInterval = d;
         }
      }
   }
   return oldestInterval;
};

/**
 * Deliver according the the config settings
 * @param {object} conf
 * @param {string} stats
 */
fxns.deliver = function(conf, stats) {
   var type = fxns.outputType(conf.to);
   switch(type) {
      case 'stdout':
         process.stdout.write(stats+"\n");
         break;
      case 'email':
         fxns.sendEmail(conf.to, {
            text: 'see attached',
            subject: '[git-stats] stats for '+conf.user,
            attachments: [
               { fileName: 'stats.'+conf.format, contents: stats }
            ]
         });
         log.info('email delivered to %s', conf.to);
         break;
      case 'file':
         fxns.writeFile(conf.to, stats);
         break;
      default:
         throw new Error('invalid output type: ' + type);
   }
};

/**
 * @param {object} stats
 * @param {boolean} [compress]
 * @return {string}
 */
fxns.toXml = function(stats, compress) {
   var out = data2xml('stats', stats);
   compress || (out = require('pretty-data').pd.xml(out));
   return out;
};

/**
 * @param {object} stats
 * @return {string}
 */
fxns.toCsv = function(stats) {
   if( stats.total.trends ) {
      return json2csv.parse({
         data: _buildCsvTrends(stats),
         fields: ['repo', 'stat', 'total'].concat(_buildCsvHeadings(stats.intervalKeys))
      });
   }
   else {
      return json2csv.parse({
         data: _buildCsvStats(stats),
         fields: ['repo'].concat(_.keys(stats.total.stats))
      })
   }
};

function _buildCsvStats(stats) {
   var out = [];
   out.push(_csvStatRow('total', stats.total));
   if( stats.repos ) {
      _.each(stats.repos, function(repo, name) {
         out.push(_csvStatRow(name, repo.stats));
      });
   }
   return out;
}

function _csvStatRow(repo, stats) {
   return _.extend({repo: repo}, stats);
}

function _buildCsvTrends(data) {

}

function _csvTrend(stats, trendData) {

}

function _buildCsvHeadings(intervalKeys) {
   var out = [];
   _.each(intervalKeys, function(keys, units) {
      out.push(units);
      _.each(keys, function(k) {
         out.push(k);
      });
   });
   return out;
}

/**
 * Convert StatsBuilder internal data into XML compatible format
 * @param {object} stats
 * @return {object} a modified deep copy of the original
 */
fxns.prepStatsForXml = function(stats) {
   var statsCopy = _deepCopy(stats); // quick and dirty deep copy
   return prepArraysForXml(prepReposForXml(statsCopy));
};

fxns.sendEmail = function(to, message, conf) {
   var p = conf.email.protocol;
   var smtpTransport = nodemailer.createTransport(p, conf.email[p]);

   // setup e-mail data with unicode symbols
   var mailOptions = _.extend({to: to}, conf.email.sendOptions, (typeof(message)==='string'? {text: message} : message));

   // send mail with defined transport object
   smtpTransport.sendMail(mailOptions, function(error, response){
      if(error){
         log.error(error);
      }else{
         log.debug("Message sent: %s", response.message);
      }

      //if you don't want to use this transport object anymore, uncomment following line
      smtpTransport.close(); // shut down the connection pool, no more messages
   });
};


/**
 * Removes trends which have a zero value for brevity
 * @param {object} stats is modified by this call!
 * @return {object} the stats object
 */
fxns.removeZeroTrends = function(stats) {
   return clearZeroTrends(stats);
};

fxns.writeFile = function(filename, data) {
   FS.writeFile(filename, data, function (err) {
      if (err) throw err;
      log.debug('wrote file %s', filename);
   });
};

fxns.format = function (format, compress, data) {
   //todo csv won't work with trends
   var out;
   switch(format) {
      case 'json':
         out = fxns.toJson(data, compress);
         break;
      case 'xml':
         out = fxns.toXml(data, compress);
         break;
      case 'csv':
         out = fxns.toCsv(data);
         break;
      case 'raw':
         out = _deepCopy(data);
         break;
      default:
         throw new Error('invalid output format: '+format);
   }
   return out;
};

fxns.startOf = function(when, units) {
   if( units === 'weeks' ) {
      return when.clone().subtract('days', when.day()).startOf('day');
   }
   else {
      return when.clone().startOf(inflection.singularize(units));
   }
};

/**
 * Store the cache file and a serialized version of the config so we can tell later if it changed.
 *
 * This is async! If something depended on the cache being written before getting used, this must be updated
 * to return a promise.
 *
 * @param {object} stats
 * @param {object} conf
 */
fxns.cache = function(stats, conf) {
   var cacheFileName = conf.cache_file;
   if( cacheFileName ) {
      var cache = fxns.cacheFormat(stats);
      cache.lastConfig = _copyConfForCache(conf);
      FS.writeFile(cacheFileName, JSON.stringify(cache), function (err) {
         if (err) throw err;
         log.info('CACHE written to %s', cacheFileName);
      });
   }
};

fxns.cacheDefaults = {
   lastUpdate: moment.utc().subtract('years', 100),
   orgs: [],
   total: {
      stats: [],
      trends: {}
   },
   repos: {},
   intervalKeys: {},
   lastConfig: {}
};

fxns.readCache = function(conf) {
   try {
      //todo use a reviver function to make moments out of iso date strings
      var path = conf.cache_file, cache = FS.existsSync(path)? fxns.fromJson(FS.readFileSync(path)) : null;
      if( cache && _statsFieldsUpdatedInConf(cache.lastConfig, conf) ) {
         //todo make this more sophisticated so that innocuous changes don't require a full rebuild
         log.warn('configuration changed, deleting cache and starting from scratch');
         fxns.cache(fxns.cacheDefaults, conf);
         return fxns.cacheDefaults;
      }
      else {
         return _.extend(fxns.cacheDefaults, cache);
      }
   }
   catch(e) {
      log.warn(e);
      return fxns.cacheDefaults;
   }
};

fxns.lastUpdated = function(path) {
   try {
      return moment(FS.statSync(path).mtime).utc();
   }
   catch(e) {
      log.warn(e);
      return null;
   }
};

fxns.analyzePatch = function(patch) {
   var out = { added: 0, deleted: 0, diff: 0 };
   _.each((patch||'').split("\n"), function(v) { // patch can sometimes be missing for zero length files :(
      var m = v.match(/^([+-])(.*)/);
      if( m ) {
         switch(m[1]) {
            case '+':
               out.added += _bytes(m[2]);
               break;
            case '-':
               out.deleted += _bytes(m[2]);
               break;
            default:
               throw new Error('this line cannot be reached');
         }
      }
   });
   out.diff = out.added - out.deleted;
   return out;
};

fxns.intervalKeys = function(intervals) {
   var out = {}, now = moment.utc();
   _.each(intervals, function(span, units) {
      var i = span, d = now.clone();
      var set = out[units] = [];
      while(i--) {
         set[i] = fxns.intervalKey(d, units);
         d.subtract(units, 1);
      }
   });
   return out;
};

fxns.intervalKey = function(d, units) {
   return fxns.startOf(d, units).utc().format();
};

/**
 * Fetch the index in the cached intervalsKey object for the date provided or return -1 if not found
 *
 * @param {object} intervalKeys
 * @param {moment} d
 * @param [units]
 * @return {int}
 */
fxns.intervalIndex = function(intervalKeys, d, units) {
   var set = intervalKeys[units];
   return set? _.indexOf(set, fxns.intervalKey(d, units)) : -1;
};

/**
 * Given a set of cached trends and a set of interval keys, make the contents of the cached data
 * match up with the interval keys so that the arrays are the same length and the contents appear in the
 * correct order. Anything in the cached data not in intervalKeys is discarded.
 *
 * @param {array} statKeys
 * @param {object} intervalKeys
 * @param {object} cachedTrendKeys
 * @param {object} cachedTrends
 */
fxns.normalizeTrends = function(statKeys, intervalKeys, cachedTrendKeys, cachedTrends) {
   var out = {};
   _.each(statKeys, function(statKey) {
      var set = out[statKey] = {};
      _.each(intervalKeys, function(dateKeys, units) {
         var i = -1, len = dateKeys.length, vals = [];
         while(++i < len) {
            vals.push(_getCachedByKey(statKey, units, dateKeys[i], cachedTrendKeys, cachedTrends));
         }
         set[units] = vals;
      });
   });
   return out;
};

/**
 * @param {string} dateKey
 * @param {Array} trendKeys
 * @param {Array} trendArray
 * @return {object}
 */
fxns.getTrendByKey = function(dateKey, trendKeys, trendArray) {
   trendKeys || (trendKeys = []);
   trendArray || (trendArray = []);
   var idx = _.indexOf(trendKeys, dateKey);
   var e   = idx > -1 && trendArray.length > idx? trendArray[idx] : null;
   return e? _.defaults(e, {avg: 0, net: 0, _c: 0}) : null;
};

fxns.allResolved = function(promises) {
   var d = Q.defer();
   var timer = setInterval(function() {
      var i = promises.length, resolved = true;
      while(i--) {
         if( _.isObject(promises[i]) && !promises[i].isResolved() ) {
            resolved = false;
            break;
         }
      }
      if( resolved ) {
         d.resolve();
         clearInterval(timer);
      }
   }, 100);
   return d.promise;
};

fxns.deepCopy = _deepCopy;

fxns.activeKeys = function(hash) {
   return _.compact(_.map(hash, function(v,k) { return v? k : null; }));
};

fxns.initStatSet = function(statHash, cache) {
   var out = {};
   cache || (cache = {});
   // add any keys that aren't in the cached data
   _.each(fxns.activeKeys(statHash), function(key) {
      out[key] = ~~cache[key];
   });
   return out;
};

fxns.addStats = function(target, source) {
   _.each(_.intersection(_.keys(target), _.keys(source)), function(key) {
      target[key] += source[key];
   });
};

fxns.toJson = function(o, compress) {
   return JSON.stringify(o, dateStringer, compress === false? 2 : undef);
};

fxns.fromJson = function(s) {
   return JSON.parse(s, dateReviver);
};

fxns.cacheFormat = function(o) {
   if( moment.isMoment(o) ) {
      return o.utc().format();
   }
   else if(_.isObject(o)) {
      o = o.clone? o.clone() : _.clone(o);
      _.each(o, function(v, k) {
         if( _.isObject(v) ) {
            if(v._cache) {
               o[k] = v._cache(v);
            }
            else {
               o[k] = fxns.cacheFormat(v);
            }
         }
      });
      return o;
   }
   else {
      return o;
   }
};

function _deepCopy(obj) {
   // convert data to a string and then back to an object, effectively erasing any references
   return fxns.fromJson(fxns.toJson(obj));
}

function _bytes(txt) {
   return Buffer.byteLength(txt, 'utf8')
}

function prepArraysForXml(data, trends) {
   if( _.isObject(data) ) {
      _.each(data, function(v, k) {
         if(typeof(k) === 'string' && k.indexOf('_') === 0) {
            delete data[k];
         }
         else if( v === null ) {
            // https://github.com/appsattic/node-data2xml/issues/2
            data[k] = '';
         }
         else if( _.isArray(v) ) {
            data[k] = {};
            data[k][ inflection.singularize(k) ] = prepArraysForXml(v);
         }
         else if(_.isObject(v) ) {
            if( trends && k in {years: 1, months: 1, weeks: 1, days: 1} ) {
               // if we are inside the trends object and encounter one of our stat sets, then
               // assign special node names to each child object and put the date into an attribute
               data[k] = {};
               data[k][ inflection.singularize(k) ] = _.map(v, prepTrendEntry);
            }
            else {
               prepArraysForXml(v, trends || k=='trends');
            }
         }
      });
   }
   return data;
}

function prepTrendEntry(stat, key) {
   return { _attr: { 'utc': key }, net: stat.net, avg: stat.avg };
}

function prepReposForXml(stats) {
   if( _.isObject(stats.repos) ) {
      var arr = [];
      for (var k in stats.repos) {
         if (stats.repos.hasOwnProperty(k)) {
            arr.push(_.extend({ _attr: {name: k} }, stats.repos[k]));
         }
      }
      stats.repos = arr;
   }
   return stats;
}

function prepLogger(conf) {
   var opts = conf || require('./logging.config.js');
   var log = new (require('winston').Logger)(opts);

   // winston doesn't allow more than one argument or provide any formatting strings; fix that here
   _.each(['error', 'warn', 'info', 'debug'], function(v) {
      var _super = log[v];
      log[v] = function() {
         var args = _.toArray(arguments), s = args[0];
         if( typeof(s) !== 'string' ) {
            s = args[0] = util.inspect(s, false, 10, true);
         }
         if( s.match(/%[sdj]\b/)) {
            return _super(util.format.apply(util, args));
         }
         else if( args.length > 2 && typeof(args[2]) !== 'function' ) {
            return _super(_.map(args, function(v) {
               switch(typeof(v)) {
                  case 'object':
                     if( moment.isMoment(v) ) { return v.format(); }
                     else { return util.inspect(v, false, 10, true); }
                  default:
                     return v;
               }
            }).join(' '));
         }
         else {
            return _super.apply(log, args);
         }
      };
   });

   return log;
//   var Log = require('log');
//   return new Log(conf.logging.level);
}

function _statsFieldsUpdatedInConf(partialConfFromCache, currConf) {
   return !_.isEqual(partialConfFromCache, _copyConfForCache(currConf));
}

function _copyConfForCache(conf) {
   var copy = _deepCopy(_.pick(conf, 'user', 'static', 'trends', 'cacheFile', 'filters'));
   copy.filters = _serializeFunctions(conf.filters);
   return copy;
}

function _serializeFunctions(obj) {
   var out = {};
   _.each(obj, function(v, k) {
      out[k] = v.toString();
   });
   return out;
}

function dateStringer(key, value) {
   if( value && typeof(value) === 'object' && moment.isMoment(value) ) {
      return value.utc().format();
   }
   return value;
}

// we don't use `key` but it's part of predefined signature for JSON.parse
//noinspection JSUnusedLocalSymbols
function dateReviver(key, value) {
   if (typeof value === 'string') {
      var a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z?$/.exec(value);
      if (a) {
         return moment(a).utc();
      }
   }
   return value;
}

/**
 * @param vals
 * @param k1
 * @param [k2]
 * @param [k3]
 * @param [k4]
 * @param [k5]
 * @return {*}
 */
function deepFind(vals, k1, k2, k3, k4, k5) {
   if( vals && typeof(vals) === 'object' ) {
      if( arguments.length > 2 ) {
         return deepFind.apply(null, [vals[k1]].concat(_.toArray(arguments).slice(2)));
      }
      else if( arguments.length == 2 ) {
         return vals[k1];
      }
   }
   return vals;
}

function _getCachedByKey(statKey, units, dateKey, cachedKeys, cachedData) {
   var keys = deepFind(cachedKeys, statKey, units)||[], idx = _.indexOf(keys, dateKey);
   return idx > -1 && cachedData && cachedData.length > idx? cachedData[idx] : {};
}