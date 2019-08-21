#!/usr/bin/env node

const fs    = require( 'fs' );
const https = require( 'https' );
const path  = require( 'path' );

const ResourceStore = require( 'resource-store' );
const { WebClient } = require( '@slack/client' );

const lib = require( '../lib' );

const config = lib.loadConfig();

const webClient = new WebClient( config.token );

const fileStorePath = path.join( config.fileStoragePath, '_files' );
const fileStore = new ResourceStore(
	fileStorePath,
	async ( key, extra, cb ) => {
		let info = null;
		try {
			info = await webClient.files.info( { file: key } );
			if ( ! info.ok ) {
				throw new Error( JSON.stringify( info ) );
			}
		} catch ( err ) {
			if ( err.data && err.data.error === 'file_not_found' ) {
				console.log( 'file not found: ' + key );
				cb( null, err.data );
				return;
			}
			throw err;
		}

		const fileUrl = info.file.url_private;
		info.saveFilename = null;

		if ( info.file.mode === 'snippet' ) {
			// This is a Slack snippet, shared inline; the full content should
			// have been sent with the API response.
			if ( typeof info.content === 'undefined' ) {
				console.log( info );
				throw new Error( 'Snippet with empty content' );
			}
			if ( info.is_truncated ) {
				console.log( info );
				throw new Error( 'Not handled yet: truncated snippet' );
			}
			console.log(
				'saving %s snippet (lines: %d)',
				info.file.pretty_type,
				info.file.lines
			);
			cb( null, info );
			return;

		} else if ( info.file.mode === 'external' ) {
			// This file is hosted elsewhere, like a Google Docs spreadsheet.
			console.log(
				'saving external file info (%s: %s)',
				info.file.filetype,
				info.file.title || info.file.name
			);
			cb( null, info );
			return;

		} else if ( info.file.mode === 'space' || info.file.mode === 'docs' ) {
			// This is a Slack post.  The 'name' property is the name of the
			// post, and the downloadable file content is a JSON representation
			// of the post.
			info.saveFilename = extra.baseFilename + '.post.json';

		} else if ( info.file.mode === 'hosted' ) {
			// This is a "normal" posted file.
			info.saveFilename = extra.baseFilename + path.extname( info.file.name );

		} else {
			console.log( info );
			throw new Error( 'Unrecognized file mode: ' + info.file.mode );
		}

		// Download the file.
		console.log( 'GET ' + fileUrl );

		let redirected = false;
		const requestArgs = {
			headers: {
				Authorization: 'Bearer ' + config.token,
			},
		};
		const processResponse = res => {
			// A single redirect is possible for some files (shared in group
			// DMs?  I'm not sure what the rule is.)
			if (
				res.statusCode === 302 &&
				/^https:\/\/slack-files\.com\/files-pri-safe\//.test(
					res.headers.location
				) &&
				! redirected
			) {
				console.log(
					'302 -> %s',
					res.headers.location.split( '?' )[ 0 ]
				);
				redirected = true;
				https.get(
					res.headers.location,
					requestArgs,
					processResponse
				);
				return;
			}

			if ( res.statusCode !== 200 ) {
				console.log( { info, headers: res.headers } );
				throw new Error( 'HTTP ' + res.statusCode );
			}

			const savePath = path.join( fileStorePath, info.saveFilename );
			fs.mkdirSync( path.dirname( savePath ), { recursive: true } );
			res.pipe( fs.createWriteStream( savePath ) )
				.on( 'error', err => { throw err; } )
				.on( 'finish', () => cb( null, info ) );
		};

		https.get( fileUrl, requestArgs, processResponse );
	}
);

lib.processHistory( async event => {
	if ( event.file_id ) {
		await new Promise( ( resolve, reject ) => {
			fileStore.get( event.file_id, ( err, value, extra ) => {
				if ( err ) {
					reject( err );
				} else {
					resolve();
				}
			} );
		} );
	}
} );
