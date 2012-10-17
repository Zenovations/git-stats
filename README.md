
# git-stats

I built this to retrieve interesting stats about my GitHub projects and stuf them into a useful json data file, so I can hook
this to a Cron Job or GitHub hook and build some charts on my site.

It can parse some pretty big repos without any trouble, even if so many requests must be made that GitHub's rate limits
will kick in (it will simply stop when the rate limit is exceeded and pick where it left off on the next run).

## Installation

1. Clone or fork the GitHub repo
2. Browse to the project directory
3. Download node.js dependencies: `npm install -d`
4. Create `config.js` and set username/password

## Usage

`node ./app.js`

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
