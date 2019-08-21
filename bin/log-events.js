#!/usr/bin/env node

const fs = require( 'fs' );

const { RTMClient } = require( '@slack/client' );

const lib = require( '../lib' );

const config = lib.loadConfig();

// Confirm write access
fs.accessSync( config.logPath, fs.constants.W_OK );

// Start listening for Slack events
const rtm = new RTMClient( config.token );
rtm.start();

rtm.on( 'authenticated', () => {
	console.error( 'Slack: connected and authenticated' );
} );

rtm.on( 'unable_to_rtm_start', () => {
	throw new Error( 'Slack: unable_to_rtm_start' );
} );

rtm.on( 'disconnected', () => {
	if ( lib.isLogging() ) {
		throw new Error( 'Slack: disconnected' );
	}
} );

rtm.on( 'slack_event', ( eventType, event ) => {
	switch ( eventType ) {
		// https://api.slack.com/rtm
		// Event types copied from Rocket.Chat SlackBridge
		case 'message':
		case 'reaction_added':
		case 'reaction_removed':
		case 'channel_created':
		case 'channel_joined':
		case 'channel_left':
		case 'channel_deleted':
		case 'channel_rename':
		case 'group_joined':
		case 'group_left':
		case 'group_rename':
		case 'team_join':
		// Other event types
		case 'channel_archive':
		case 'channel_unarchive':
		case 'group_archive':
		case 'group_unarchive':
		case 'emoji_changed':
		case 'file_change':
		case 'file_comment_added':
		case 'file_comment_deleted':
		case 'file_comment_edited':
		case 'file_created':
		case 'file_deleted':
		case 'file_public':
		case 'file_shared':
		case 'file_unshared':
		case 'member_joined_channel':
		case 'member_left_channel':
		case 'user_change':
			lib.logEvent( config.logPath, event );
			break;
	}
} );

process.on( 'SIGINT', () => {
	console.error( 'Caught SIGINT; cleaning up' );
	lib.stopLogging();
	rtm.disconnect().then( () => {
		lib.closeLogFile( () => {
			console.error( 'Exiting' );
			process.exit( 1 );
		} );
	} );
} );
