
var   Q          = require('q'),
      _          = require('underscore'),
      base64     = require('./base64.js'),
      GitHubApi  = require('github'),
      moment     = require('moment'),
      util       = require('util'),
      nodemailer = require("nodemailer");

var PER_PAGE = 100;

//todo the auth process here is a bit hokey, mostly because node-github's auth process is a bit hokey
//todo how to improve it?

/**
 * @param {string} user
 * @param {string} [pass]
 * @constructor
 */
function GitHubWrapper(user, pass) {
   this.gh = new GitHubApi({version: '3.0.0'});
   this.user = user;
   this.auth = auth(this.gh, user, pass);
}

/**
 * @param {function} iterator called once with each org object, if this function returns {boolean}false, iteration is stopped
 * @return {promise}
 */
GitHubWrapper.prototype.orgs = function(iterator) {
   return acc(this.auth, iterator, this.gh.orgs, 'getFromUser', {user: this.user});
};

/**
 * @param {string} [org]
 * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is stopped
 * @return {promise}
 */
GitHubWrapper.prototype.repos = function(org, iterator) {
   if( typeof(org) === 'function' ) {
      iterator = arguments[0];
      org = null;
   }
   var options = {user: this.user};
   if( org ) { options.org = org; }
   var method = options.org? 'getFromOrg' : 'getFromUser';
   return acc(this.auth, iterator, this.gh.repos, method, options);
};

/**
 * @param {string} owner
 * @param {string} repo
 * @param {function} iterator
 * @param {string} [sha]
 * @return {promise}
 */
GitHubWrapper.prototype.commits = function(owner, repo, iterator, sha) {
   var options = {user: owner, repo: repo};
   if( sha ) { options.sha = sha }
   return acc(this.auth, iterator, this.gh.repos, 'getCommits', options);
};

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha
 * @param {function} iterator
 * @return {promise}
 */
GitHubWrapper.prototype.commit = function(owner, repo, sha, iterator) {
   this.auth();
   var options = {user: owner, repo: repo, sha: sha};
   return Q.ninvoke(this.gh.repos, 'getCommit', options).then(function(data) {
      return iterator(data);
   });
};

function auth(gh, user, pass) {
   if( pass ) {
      return function() {
         gh.authenticate({type: 'basic', username: user, password: pass});
      }
   }
   else {
      return function() {};
   }
}

function acc(auth, iterator, obj, method, props, page) {
   auth();
   page || (page = 1);
   var opts = _.extend({}, props, {per_page: PER_PAGE, page: page});
   return Q.ninvoke(obj, method, opts).then(function(data) {
      var status = 'success', meta = (data && data.meta) || {};
      if( data && data.length ) {
         var i = -1, len = data.length, res, promises = [];
         while(++i < len && status === 'success') {
            // run the iterator with each page, check it for a promise and store it if one is found
            res = iterator(data[i], opts.user, opts.repo);
            if( Q.isPromise(res) ) {
               promises.push(res);
            }
            else if( res === false ) {
               status = 'stopped';
            }
         }
         return Q.all(promises).then(function() {
            // conduct pagination but wait for all the iterator promises to resolve first; this is a safety measure
            // since something in the current page could affect what we do with the remainder of the data
            if( status === 'success' && len == PER_PAGE ) {
               return acc(auth, iterator, obj, method, props, page+1);
            }
            else {
               return status;
            }
         });
      }
      return status;
   });
}

var RateLimitError = function (msg, repo, sha) {
   Error.captureStackTrace(this, RateLimitError);
   this.message = msg || 'Error';
   this.repo = repo;
   this.sha = sha;
};
util.inherits(RateLimitError, Error);
RateLimitError.prototype.name = 'RateLimitError';
GitHubWrapper.RateLimitError = RateLimitError;

module.exports = GitHubWrapper;