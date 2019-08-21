# Slack Archiver

This is a set of tools for archiving a Slack workspace, including files and
private channels.

Each essential function is performed by a separate script file:

- Archive all visible messages to newline-delimited JSON files
- Use the
  [Slack RTM API](https://api.slack.com/rtm)
  to log events to newline-delimited JSON files as they happen
- Archive all files seen by the bot

Future plans include merging data from other sources (like Slack export files),
downloading custom emoji, and automatically building/updating a HTML archive of
received messages.

## Setup

- [Create a Slack app with a bot user](https://api.slack.com/bot-users)
  and save the token.
- Add the bot user to any channels you want to archive.
- Copy `sample-config.json` to `config.json` and fill in the values.
- Run `npm install`.

## Archiving message history

Run `bin/log-history.js`.  This script will archive all message history that is
currently visible to the user associated with the token, subject to the 10,000
message limit for the free Slack plan.

This script saves a set of newline-delimited JSON log files under the
`historyPath` directory specified in the config file, with one subdirectory per
month and one file per hour (using the format `YYYY-MM/YYYY-MM-DD_HH.log`).

## Archiving messages in realtime

Run `bin/log-events.js`.  This script will connect to the Slack API and listen
for events.  It will try to reconnect if it gets disconnected, but you are
responsible for restarting it if it experiences some other error.

This script saves a set of newline-delimited JSON log files under the `logPath`
directory specified in the config file, with one subdirectory per month and one
file per hour (using the format `YYYY-MM/YYYY-MM-DD_HH.log`).

## Archiving files

Run `bin/download-files.js`.  This script will process all the JSON log files
saved by `bin/log-events.js` and `bin/log-history.js`, look for files, and
download them (along with their metadata from the Slack API) to the
`fileStoragePath` directory specified in the config file.

Currently you must run this script every time you want to download new files.
This may be improved in the future.
