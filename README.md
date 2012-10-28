
# git-stats

Retrieve interesting stats (configurable) about GitHub projects and stuff them into a useful data file (json/csv/xml),
so they can be used to generate pretty charts and trends.

It can parse some pretty big repos without trouble, even if so many requests must be made that GitHub's rate limits
will be exceeded.

I wrote this as a quick and dirty tool for my own use but it's probably adaptable enough to help anyone wanting a
simple way to generate stats via the API.

## Features

 * Simple (just configure repo and stats you want to collect, get your formatted (json/xml/csv) data and chart it)
 * Fast (stats are cumulative and cached, only data changed since last update is requested and parsed)
 * Handles rate limits gracefully (restarts where it left off last)
 * Handles large repositories (keeps a minimal amount of data in memory at any time)
 * Filtering (exclude orgs, repos, dirs, or files using a filter callback)

## Installation

1. Clone or fork the GitHub repo
2. Browse to the project directory
3. `npm install -d` (download node.js dependencies)

## Usage

The simplest way to utilize git-stats is to compile a static file (via a cron, upstart, or scheduled service)
which can be requsted via HTTP. This is done with `app.js`:

    # Copy `config.sample.js` to `config.js` and set username/password
    node ./app.js

This is preferable to building the stats in real time when they are requested due to the rate limits on GitHub's API.

You may also generate stats within your own application by including the git-stats directory (index.js) as a module:

    var GitStats = require('git-stats');
    GitStats.run({user: 'katowulf', pass: 'xxxxx' })
       .then(function(results) {
          console.log( results.getStats(format, compress) );
          console.log( results.getTrends(format, compress) );
       })
       .fail(function(e) {
          console.error(e);
       });

The config.js file is not utilized when git-stats is used as a library. However, the default settings from
config.sample.js are used for anything not passed in the config. Of course, the settings for sending emails
and output formats will be completely ignored as these are the purview of the calling script.

### Configuration options

//todo

//todo all times are in utc

### Examples

//todo examples
//todo demo

### Memory usage, CPU cycles, and storage space

The disk and memory usage for storing one trend can be roughly calculated using this pseudo-formula:
`bytes = number_of_repos * sum(trends.intervals) * ~40 bytes` (64bit number + ISO formatted date string + json syntax)

For example, storing `watchers` for 10 GitHub repositories over {years: 10, months: 12, weeks: 25, days: 30}
would be approximately 31K uncompressed: 10 * (10 + 12 + 25 + 30) * 40

Storing all 9 stats would be around 279K (31K * 9) and storing all 9 stats for 100 repos would cost around 2.7MB.

Compression, naturally, would greatly improve this since the data is nothing but text. XML is quite a bit more
verbose and creates a considerably larger footprint.

Adding averages into the trends does not significantly increase the footprint, as it only requires caching 2 64bit
numbers for the last 31 days and 12 months (i.e. around 1k with json syntax for each stat recorded) and adds one
additional key/value to the output data.

## Limitations

* Changes to the config file's stats may require the cache be deleted and all stats recompiled; this trade-off
  is annoying but keeps the cache size much smaller since it only needs to store compiled data and not all
  historic numbers (which would honestly require a full-on database)
* Doesn't support OAuth
* Does not handle branches (just reads the master); this would be trivial to change but I didn't need it

## License

Creative Commons: http://creativecommons.org/licenses/by-sa/3.0/

