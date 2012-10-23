
# git-stats

I built this to retrieve interesting stats about my GitHub projects and stuf them into a useful json data file, so I can hook
this to a Cron Job or GitHub hook and build some charts on my site.

It can parse some pretty big repos without trouble, even if so many requests must be made that GitHub's rate limits
will kick in (it stops when the rate limit is exceeded and picks up where it left off on the next run).

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

The simplest way to utilize git-stats is to compile a static json file (via a cron job or prompt)
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

### Configuration options

//todo

//todo all times are in utc

### Examples

//todo examples
//todo demo

## Limitations

Doesn't support OAuth
Does not handle branches (just reads the master)

## License

Creative Commons: http://creativecommons.org/licenses/by-sa/3.0/

# Testing

N/A
