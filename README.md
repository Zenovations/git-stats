
# git-stats

Retrieve interesting stats (configurable) about GitHub projects attached to a given user/org and stuff them into a useful
data file (json/csv/xml), so they can be used to generate pretty charts and trends.

It can parse some pretty big repos without trouble, even if so many requests must be made that GitHub's rate limits
will be exceeded.

I wrote this as a quick and dirty tool for my own use but it's probably adaptable enough to help anyone wanting a
simple way to generate stats and track trends via the GitHub API.

## Features

 * Simple: just configure stats you want, get your formatted json/xml/csv data and chart it
 * Fast: stats are cumulative, cached, and only changes are read
 * Handles rate limits gracefully by resuming where it left off
 * Handles large numbers of commits, only one has to fit in memory at a time
 * Filter by org, directory, or file patterns

## Installation

1. Clone or fork the GitHub repo
2. Browse to the project directory
3. `npm install -d` (download node.js dependencies)

## Usage

### Cron Job

The simplest way to utilize git-stats is to compile a static file (via a cron, upstart, or scheduled service)
which can be requsted via HTTP. This is done with `app.js`:

Copy `config.sample.js` to `config.js` and set username/password, then run:

    node ./app.js

This is preferable to building the stats in real time when they are requested due to the rate limits on GitHub's API.

### Using GitHub Service Hooks

You can have the stats build whenever a commit occurs by creating hooks in GitHub.

Copy `config.sample.js` to `config.js`, set `username`, set `password`, and set `port` to an arbitrary
number greater than 3000

In GitHub, go to repo > Admin > Service Hooks > WebHook URLs and point your WebHook
to `http://yourservername.tld:nnnn` where nnnn is the port number.

Start up the server:

      cd git-stats
      node ./server.js

Whenever GitHub receives a commit, it will call that URL and git-stats will accumulate the new commit into its stats.

### Use as a Lib

You may also generate stats within your own application by including the git-stats directory (index.js) as a module:

    var GitStats = require('git-stats');
    var config = {user: 'katowulf', pass: 'xxxxx' }; //any values from config.sample.js
    GitStats.run(config)
       .then(function(results) {
          console.log( results.format(format, compress) );
       })
       .fail(function(e) {
          console.error(e);
       });

Or if you want it to handle everything (saving files, emails, etc) you can use the `auto` method, which is equivalent
to executing `app.js`:

    var GitStats = require('git-stats');
    var config = {user: 'katowulf', pass: 'xxxxx' }; //any values from config.sample.js
    GitStats.auto(config);

### Configuration options

See the comments in config.sample.js

### Examples

Visit http://zenovations.github.com/git-stats

### Memory usage, CPU cycles, and storage space

The disk and memory usage for storing one trend can be roughly calculated using this pseudo-formula:
`trend_size = number_of_repos * sum(trends.intervals) * 10 bytes` (a 64bit number plus some json syntax is around 10 bytes)

For example, storing `watchers` for 10 GitHub repositories over {years: 10, months: 12, weeks: 25, days: 30}
would be approximately 7.7K uncompressed: 10 * (10 + 12 + 25 + 30) * 10

Storing all 9 stats would be around 69k (7.7k * 9) and storing all 9 stats for 10 repos would cost around 690k.

Compression, naturally, would greatly improve this since the data is nothing but text. XML is quite a bit more
verbose and creates a considerably larger footprint.

## Limitations

* This lib doesn't format data for various libs; that's your job; it just accumulates and stores it for reference
* Changes to the config file's stats may require the cache be deleted and all stats recompiled; this trade-off
  is annoying but keeps the cache size much smaller since it only needs to store compiled data and not all
  historic numbers (which would honestly require a full-on database)
* Doesn't support OAuth
* Does not handle branches (just reads the master); this would be trivial to change but I didn't need it

## License

Creative Commons: http://creativecommons.org/licenses/by-sa/3.0/

