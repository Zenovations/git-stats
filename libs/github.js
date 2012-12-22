
var   Q          = require('q'),
      _          = require('underscore'),
      base64     = require('./base64.js'),
      GitHubApi  = require('github'),
      moment     = require('moment'),
      util       = require('util'),
      nodemailer = require("nodemailer");

var PER_PAGE = 100;

/**
 * @param {string} user
 * @param {string} [pass]
 * @constructor
 */
function GitHubWrapper(user, pass) {
   this.gh = new GitHubApi({version: '3.0.0'});
   this.user = user;
   //todo support oauth
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
 * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is stopped
 * @return {promise}
 */
GitHubWrapper.prototype.repos = function(iterator) {
   // this fetches private repos
   var options = {user: this.user, type: 'all', sort: 'updated', direction: 'desc'};
   return acc(this.auth, iterator, this.gh.repos, 'getAll', options);
};

/**
 * @param {string} owner
 * @param {string} repo
 * @param {function} iterator
 * @param {string} [lastReadSha]
 * @return {promise}
 */
GitHubWrapper.prototype.commits = function(owner, repo, iterator, lastReadSha, includeDetails) {
   var options = {user: owner, repo: repo};
   if( lastReadSha ) {
      options.sha = lastReadSha
   }
   if( includeDetails ) {
      iterator = _wrapIteratorWithDetails(this, iterator);
   }
   return acc(this.auth, iterator, this.gh.repos, 'getCommits', options);
};

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha
 * @return {promise}
 */
GitHubWrapper.prototype.commit = function(owner, repo, sha) {
   this.auth();
   var options = {user: owner, repo: repo, sha: sha};
   return Q.ninvoke(this.gh.repos, 'getCommit', options);
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
      var def = Q.resolve('success');
      if( data && data.length ) {
         // just a quick and dirty scoping function to store each iteration of data array for future invocation
         function fx(rec, user, repo) {
            return function(prevResult) {
               if( prevResult === false ) {
                  // if the previous iterator returned false, then we're done invoking results
                  return false;
               }
               else {
                  // iterator may return a promise which becomes the new deferred
                  return iterator(rec, user, repo, data.meta);
               }
            }
         }

         var i = -1, len = data.length, res, promises = [];
         while(++i < len) {
            // make sure they run sequentially so the iterator can do its job correctly and get sequential data
            def = def.then(fx(data[i], opts.user, opts.repo));
         }
         return def.then(function(prevResult) {
            // conduct pagination but wait for all the last iterator to resolve first; this is a safety measure
            // to make sure that iterated results stay sequential and because something in the current page could
            // affect whether the iterator wants to continue (and it could abort after we've already started to
            // retrieve the next page)
            if( prevResult !== false && len == PER_PAGE ) {
               return acc(auth, iterator, obj, method, props, page+1);
            }
            else {
               return true;
            }
         });
      }
      return def;
   });
}

function _wrapIteratorWithDetails(gh, iterator) {
   return function(rec, user, repo, meta) {
      return gh.commit(user, repo, rec.sha).then(function(details) {
         return iterator(details, user, repo, details.meta);
      })
   }
}

module.exports = GitHubWrapper;