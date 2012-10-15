
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

/**
 * @param {string} owner
 * @param {string} repo
 * @param {function} iterator called once with each repo object, if this function returns {boolean}false, iteration is aborted
 * @param {object} [filters] may contain any of {moment}since, {function}dirFilter, {function}fileFilter
 * @return {promise}
 */
exports.files = function(owner, repo, iterator, filters) {
   var opts = {user: owner, repo: repo};
   return accFiles(iterator, opts, filters);
};

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} path relative path from repo root, do not start it with /
 * @return {promise}
 */
exports.file = function(owner, repo, path) {
   var opts = {user: owner, repo: repo, path: path};
   return Q.ninvoke(gh.repos, 'getContent', opts);
};

function accFiles(iterator, props, filters, path, page) {
   page || (page = 1);
   filters || (filters = {});
   var opts = _.extend({}, props, {per_page: PER_PAGE, page: page}, {path: path || ''});
   return Q.ninvoke(gh.repos, 'getContent', opts).then(function(files) {
      var promises = [], i = -1, len = files.length, filePath, f, aborted;
      while(++i < len && !aborted) {
         //todo
         //todo filter.since!
         //todo

         f = files[i];
         filePath = f.path;
         if( f.type == 'dir' && (!filters.dirFilter || filters.dirFilter(f)) ) {
            console.log('recursing to', filePath, f);
            promises.push(accFiles(iterator, props, filters, filePath));
         }
         else if( f.type == 'file' && (!filters.fileFilter || filters.fileFilter(f)) ) {
//            var res = iterator(f, props.repo, props.user);
//            if( Q.isPromise(res) ) { promises.push(res); }
//            else if( res === false ) {
//               aborted = true;
//            }
         }
      }

      if( !aborted && len == PER_PAGE ) {
         // get next page
         promises.push(accFiles(iterator, props, filters, path, page+1));
      }

      return Q.all(promises);
   });
}

function acc(iterator, obj, method, props, page) {
   page || (page = 1);
   var opts = _.extend({}, props, {per_page: PER_PAGE, page: page});
   return Q.ninvoke(obj, method, opts).then(function(data) {
      var aborted = false;
      if( data && data.length ) {
         var i = -1, len = data.length, res, promises = [];
         while(++i < len && !aborted) {
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