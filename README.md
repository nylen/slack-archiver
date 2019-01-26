# Slack Archiver

This will be a set of tools for archiving a Slack workspace, including files
and private channels.

For now it just uses the
[Slack RTM API](https://api.slack.com/rtm)
to log events to newline-delimited JSON files as they happen.

Future plans include merging data from other sources (like Slack export files),
downloading files and custom emoji, and automatically building/updating a HTML
archive of received messages.

## Setup

- [Create a Slack app with a bot user](https://api.slack.com/bot-users)
  and save the token.
- Add the bot user to any channels you want to archive.
- Copy `sample-config.json` to `config.json` and fill in the values.
- Run `npm install` and `bin/log-events.js`.  You are responsible for starting
  the app and keeping it running.

## Output

A set of newline-delimited JSON files are saved under the `logPath` directory
specified in the config file, with one subdirectory per month and one file per
hour (using the format `YYYY-MM/YYYY-MM-DD_HH.log`).
