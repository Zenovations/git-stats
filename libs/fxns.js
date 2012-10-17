
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

var VALID_EMAIL = /((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?/;

var fxns = exports;

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
 * Override console output for simple debugging
 */
fxns.suppressLogs = function() {
   var old_log = console.log;
   console.log = function() {};
   return function() {
      console.log = old_log;
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
         console.log('email delivered', conf.to);
         break;
      case 'file':
         fxns.writeFile(conf.to, stats);
         break;
      default:
         throw new Error('invalid output type', type);
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
   var data = _.toArray(stats.repos);
   return json2csv.parse({
      data: data,
      fields: data.length? _.keys(data[0]) : []
   });
};

/**
 * Convert StatsBuilder internal data into XML compatible format
 * @param {object} stats
 * @return {object} a modified deep copy of the original
 */
fxns.prepStatsForXml = function(stats) {
   var statsCopy = JSON.parse(JSON.stringify(stats)); // quick and dirty deep copy
   return prepArraysForXml(prepReposForXml(statsCopy));
};

/**
 * Convert StatsBuilder internal trends into XML compatible format
 * @param {object} trends
 * @return {object} a modified deep copy of the original
 */
fxns.prepStatsForXml = function(trends) {
   var data = JSON.parse(JSON.stringify(trends)); // quick and dirty deep copy
   return prepArraysForXml(data);
};

fxns.sendEmail = function(to, message) {
   var p = conf.email.protocol;
   var smtpTransport = nodemailer.createTransport(p, conf.email[p]);

   // setup e-mail data with unicode symbols
   var mailOptions = _.extend({to: to}, conf.email.sendOptions, (typeof(message)==='string'? {text: message} : message));

   // send mail with defined transport object
   smtpTransport.sendMail(mailOptions, function(error, response){
      if(error){
         console.log(error);
      }else{
         console.log("Message sent: " + response.message);
      }

      //if you don't want to use this transport object anymore, uncomment following line
      smtpTransport.close(); // shut down the connection pool, no more messages
   });
};


/**
 * This is async! that's not an issue here, but could be if something depended on the cache
 * being written first before getting used.
 *
 * @param {object} stats
 * @param {string} cacheFileName
 */
fxns.cache = function(stats, cacheFileName) {
   if( cacheFileName ) {
      var cache = clearZeroTrends(stats);
      FS.writeFile(cacheFileName, JSON.stringify(cache), function (err) {
         if (err) throw err;
         console.log('stats cached in ', cacheFileName);
      });
   }
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
      console.log('wrote file ', filename);
   });
};

fxns.format = function (format, compress, data) {
   var out;
   switch(format) {
      case 'json':
         out = compress? JSON.stringify(data) : JSON.stringify(data, null, 2);
         break;
      case 'xml':
         out = fxns.toXml(data, compress);
         break;
      case 'csv':
         out = fxns.toCsv(data);
         break;
      case 'raw':
         out = JSON.parse(JSON.stringify(data));
         break;
      default:
         throw new Error('invalid output format: '+format);
   }
   return out;
};

fxns.startOf = function(when, units) {
   if( units === 'weeks' ) {
      return when.subtract('days', when.day()).startOf('day');
   }
   else {
      return when.startOf(inflection.singularize(units));
   }
};

fxns.readCache = function(path) {
   try {
      return FS.existsSync(path)? JSON.parse(FS.readFileSync(path)) : null;
   }
   catch(e) {
      console.error(e);
      return null;
   }
};

fxns.analyzePatch = function(patch) {
   var out = { added: 0, deleted: 0 };
   _.each(patch.split("\n"), function(v) {
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

function _bytes(txt) {
   return Buffer.byteLength(txt, 'utf8')
}



function prepArraysForXml(data) {
   if( _.isArray(data) ) {
      var i = data.length;
      while(i--) {
         if( _.isObject(data[i]) ) {
            prepArraysForXml(data[i]);
         }
         else if( data[i] === null ) {
            // https://github.com/appsattic/node-data2xml/issues/2
            data[i] = '';
         }
      }
   }
   else if( _.isObject(data) ) {
      for (var k in data) {
         if (data.hasOwnProperty(k) ) {
            if( data[k] === null ) {
               // https://github.com/appsattic/node-data2xml/issues/2
               data[k] = '';
            }
            else if( _.isArray(data[k]) ) {
               var v = data[k];
               data[k] = {};
               data[k][ inflection.singularize(k) ] = prepArraysForXml(v);
            }
            else if(_.isObject(data[k]) ) {
               prepArraysForXml(data[k]);
            }
         }
      }
   }
   return data;
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

function clearZeroTrends(stats) {
   _.each(stats, function(v, k) {
      if( _.isArray(v) && k in {'years': 1, 'months': 1, 'weeks': 1, 'days': 1} ) {
         stats[k] = _.filter(v, function(v) {
            return _.last(v) > 0;
         });
      }
      else if(_.isObject(v) ) {
         clearZeroTrends(v);
      }
   });
   return stats;
}