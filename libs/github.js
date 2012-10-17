
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
 * @param {function} iterator called once with each org object, if this function returns {boolean}false, iteration is aborted
 * @return {promise}
 */
GitHubWrapper.prototype.orgs = function(iterator) {
   return acc(this.auth, iterator, this.gh.orgs, 'getFromUser', {user: this.user});
};

/**
 * @param {string} [org]
 * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is aborted
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

GitHubWrapper.prototype.commits = function(owner, repo, iterator, since) {
   //todo
   //todo
   //todo
};

GitHubWrapper.prototype.commit = function(owner, repo, sha) {
   //todo
   //todo
   //todo
};

///**
// * @param {string} owner
// * @param {string} repo
// * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is aborted
// * @param {object} [filters] may contain any of {moment}since, {function}dirFilter, {function}fileFilter
// * @return {promise}
// */
//GitHubWrapper.prototype.files = function(owner, repo, iterator, filters) {
//   var opts = {user: owner, repo: repo};
//   return accFiles(this.auth, iterator, opts, filters);
//};
//
///**
// * @param {string} owner
// * @param {string} repo
// * @param {string} path relative path from repo root, do not start it with /
// * @return {promise}
// */
//GitHubWrapper.prototype.file = function(owner, repo, path) {
//   var opts = {user: owner, repo: repo, path: path};
//   this.auth();
//   return Q.ninvoke(this.gh.repos, 'getContent', opts);
//};

//function accFiles(auth, iterator, props, filters, path, page) {
//   auth();
//   page || (page = 1);
//   filters || (filters = {});
//   var opts = _.extend({}, props, {per_page: PER_PAGE, page: page}, {path: path || ''});
//   return Q.ninvoke(gh.repos, 'getContent', opts).then(function(files) {
//      var promises = [], i = -1, len = files.length, filePath, f, aborted;
//      while(++i < len && !aborted) {
//         //todo
//         //todo filter.since!
//         //todo
//
//         f = files[i];
//         filePath = f.path;
//         if( f.type == 'dir' && (!filters.dirFilter || filters.dirFilter(f)) ) {
//            console.log('recursing to', filePath, f);
//            promises.push(accFiles(auth, iterator, props, filters, filePath));
//         }
//         else if( f.type == 'file' && (!filters.fileFilter || filters.fileFilter(f)) ) {
////            var res = iterator(f, props.repo, props.user);
////            if( Q.isPromise(res) ) { promises.push(res); }
////            else if( res === false ) {
////               aborted = true;
////            }
//         }
//      }
//
//      if( !aborted && len == PER_PAGE ) {
//         // get next page
//         promises.push(accFiles(auth, iterator, props, filters, path, page+1));
//      }
//
//      return Q.all(promises);
//   });
//}

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
            res = iterator(data[i], meta);
            if( Q.isPromise(res) ) {
               promises.push(res);
            }
            else if( res === false ) {
               status = 'aborted';
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