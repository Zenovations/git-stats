/*
 * base64.js: An extremely simple implementation of base64 encoding / decoding using node.js Buffers
 *
 * (C) 2010, Nodejitsu Inc.
 * git://gist.github.com/815609.git
 */

var base64 = exports;

base64.encode = function (unencoded) {
   return new Buffer(unencoded || '').toString('base64');
};

base64.decode = function (encoded) {
   return new Buffer(encoded || '', 'base64').toString('utf8');
};

