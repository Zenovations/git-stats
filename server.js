/**
 * Listens on conf.port for GitHub queries and invokes git-stats whenever one is received
 */
var conf       = require('./config.js'),
    fxns       = require('./libs/fxns.js'),
    port       = conf.port || 3001;

var http = require('http');
http.createServer(function (req, res) {

   console.log(req.method, req.url);

   //todo make this actually use the data since via GitHub so there is no API request necessary
   res.writeHead(200, {'Content-Type': 'text/plain'});
   res.end('Thanks!\n');

   // run the git-stats accumulator and email/file/output results according to config.js
   fxns.autoRunStats(conf);

}).listen(port);

console.log('Server running at http://127.0.0.1:'+port+'/');

