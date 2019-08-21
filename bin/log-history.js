#!/usr/bin/env node

const fs   = require( 'fs' );

const { WebClient } = require( '@slack/web-api' );

const lib = require( '../lib' );

const config = lib.loadConfig();

// Confirm write access
fs.accessSync( config.historyPath, fs.constants.W_OK );

async function logHistoryEvent( message ) {
	let messageSaved = false;
	try {
		messageSaved = lib.logEvent(
			config.historyPath,
			message,
			{ verbose: false, avoidDuplicates: true }
		);
	} catch ( err ) {
		if ( err._writeBufferFull ) {
			await new Promise( resolve => {
				lib.getLogFileStream().on( 'drain', resolve );
			} );
			messageSaved = lib.logEvent(
				config.historyPath,
				message,
				{ verbose: false, avoidDuplicates: true }
			);
		} else {
			throw err;
		}
	}
	return messageSaved;
}

async function go() {
	// Store total counts
	let messagesTotalSeen = 0;
	let messagesTotalNew = 0;

	// Set up API client
	const web = new WebClient( config.token );

	// Loop through channels and DMs
	const types = 'public_channel,private_channel,mpim,im';
	for await ( const pChannels of web.paginate( 'conversations.list', { types } ) ) {
		for ( const channel of pChannels.channels ) {
			let prefix = '#';
			if ( channel.is_im ) {
				prefix = '@';
			} else if ( channel.is_private ) {
				prefix = '!';
			}
			console.error(
				'Channel: %s%s',
				prefix,
				channel.name || channel.user || channel.id
			);
			let messagesSeen = 0;
			let messagesNew = 0;

			// Loop through messages
			for await ( const pMessages of web.paginate(
				'conversations.history',
				{ channel: channel.id }
			) ) {
				for ( const message of pMessages.messages ) {
					message._history_id = [
						channel.id,
						message.ts,
						message.user,
					].join( '|' );
					if ( message.edited ) {
						message._history_id += '|edited=' + message.edited.ts;
					}
					// The web API occasionally returns duplicate messages,
					// probably split across different pages. This may cause
					// more messages to be counted as "seen" than as "new".
					messagesSeen++;
					if ( await logHistoryEvent( message ) ) {
						messagesNew++;
					}

					// Fetch thread messages (if any)
					// Messages with subtype 'thread_broadcast' have
					// `thread_ts` but not `reply_count`
					if ( message.thread_ts && message.reply_count ) {
						let threadText = message.text;
						if ( threadText.length > 45 ) {
							threadText = threadText.substring( 0, 42 ) + '...';
						}
						console.error(
							'Thread: %s (replies: %d)',
							threadText,
							message.reply_count
						);
						for await ( const pReplies of web.paginate(
							'conversations.replies',
							{ channel: channel.id, ts: message.thread_ts }
						) ) {
							for ( const reply of pReplies.messages ) {
								reply._history_id = [
									channel.id,
									reply.ts,
									reply.user,
									'thread_ts=' + reply.thread_ts,
								].join( '|' );
								if ( reply.edited ) {
									reply._history_id += '|edited=' + reply.edited.ts;
								}
								// Message subtype may be 'thread_broadcast',
								// in which case don't count it because we
								// already saw it in 'conversations.history'
								if ( reply.subtype ) {
									await logHistoryEvent( reply );
								} else {
									messagesSeen++;
									reply.subtype = '_message_replied';
									if ( await logHistoryEvent( reply ) ) {
										messagesNew++;
									}
								}
							}
						}
					}
				}
			}

			// Display channel statistics
			console.error(
				'Channel: %s%s DONE, messages: %d (%d new)',
				prefix,
				channel.name || channel.user || channel.id,
				messagesSeen,
				messagesNew
			);
			messagesTotalSeen += messagesSeen;
			messagesTotalNew += messagesNew;
		}
	}

	// Display total statistics
	console.error(
		'TOTAL MESSAGES: %d (%d new)',
		messagesTotalSeen,
		messagesTotalNew
	);
}

go();
