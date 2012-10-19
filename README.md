
# git-stats

I built this to retrieve interesting stats about my GitHub projects and stuf them into a useful json data file, so I can hook
this to a Cron Job or GitHub hook and build some charts on my site.

It can parse some pretty big repos without any trouble, even if so many requests must be made that GitHub's rate limits
will kick in (it will simply stop when the rate limit is exceeded and pick where it left off on the next run).

## Features

 * Simple (just configure repo and stats you want to collect, get your formatted (json/xml/csv) data and chart it)
 * Fast (stats are cumulative and cached, only data changed since last update is requested and parsed)
 * Handles rate limits gracefully
 * Handles large repositories (the only thing that has to fit in memory is the commit API data and the compiled stats)
 * Filter repositories, directories, or files from the accumulated stats

## Installation

1. Clone or fork the GitHub repo
2. Browse to the project directory
3. `npm install -d` (download node.js dependencies)

## Usage

Running stats as a CLI script (via a cron job or prompt):

    # Copy `config.sample.js` to `config.js` and set username/password
    node ./app.js

Including stats as a lib in your application:

    var GitStats = require('git-stats');
    GitStats.run({user: 'katowulf'})
       .then(function(results) {
          console.log( results.getStats(format, compress) );
          console.log( results.getTrends(format, compress) );
       })
       .fail(function(e) {
          console.error(e);
       });


//todo config options
//todo all times are in utc
//todo examples
//todo demo (online example)

## Limitations

Doesn't support OAuth
Does not handle branches (just reads the master)

## License

Creative Commons: http://creativecommons.org/licenses/by-sa/3.0/

# Testing

N/A
