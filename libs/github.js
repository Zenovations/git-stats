
var   Q          = require('q'),
      _          = require('underscore'),
      base64     = require('./base64.js'),
      GitHubApi  = require('github'),
      inflection = require('inflection'),
      moment     = require('moment'),
      util       = require('util'),
      nodemailer = require("nodemailer"),
      FS         = require('fs');

var PER_PAGE = 100;

var gh = new GitHubApi({version: '3.0.0'});

/**
 * @param {string} user the GitHub user to retrieve orgs for
 * @param {function} iterator called once with each org object, if this function returns {boolean}false, iteration is aborted
 * @return {promise}
 */
exports.orgs = function(user, iterator) {
   return acc(iterator, gh.orgs, 'getFromUser', {user: user});
};

/**
 * @param {string} user
 * @param {string} [org]
 * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is aborted
 * @return {promise}
 */
exports.repos = function(user, org, iterator) {
   if( typeof(org) === 'function' ) {
      iterator = arguments[1];
      filter = arguments[2];
      org = null;
   }
   var options = {user: user};
   if( org ) { options.org = org; }
   var method = options.org? 'getFromOrg' : 'getFromUser';
   return acc(iterator, gh.repos, method, options);
};

exports.commits = function(owner, repo, iterator) {
   //todo
   //todo
   //todo
};

exports.commit = function(owner, repo, sha) {
   //todo
   //todo
   //todo
};

exports.files = function(owner, repo, iterator, options) {
   //todo
   //todo options: modifiedSince, dirFilter, fileFilter
   //todo
};

function acc(iterator, obj, method, props, page) {
   page || (page = 1);
   var opts = _.extend({}, props, {per_page: PER_PAGE, page: page});
   return Q.ninvoke(obj, method, opts).then(function(data) {
      var aborted = false;
      if( data && data.length ) {
         var i = -1, len = data.length, res, promises = [];
         while(++i < len && !aborted) {
            //todo iterator might need to return a promise; if it does, then this should wait for
            //todo it to complete before declaring the promises fulfilled
            res = iterator(data[i]);
            if( Q.isPromise(res) ) {
               promises.push(res);
            }
            else {
               aborted =  res === false;
            }
         }
         return Q.all(promises).then(function() {
            if( !aborted && len == PER_PAGE ) {
               return acc(iterator, obj, method, props, page+1);
            }
            else {
               return aborted;
            }
         });
      }
      return aborted;
   });
}