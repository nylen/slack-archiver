const fs     = require( 'fs' );
const path   = require( 'path' );
const stream = require( 'stream' );
const util   = require( 'util' );

const split = require( 'split' );
const walk  = require( 'walk' );

// https://github.com/nodejs/node/issues/17871 :(
// process.throwDeprecation = true;
process.on( 'unhandledRejection', err => {
	console.error( 'Unhandled promise rejection:', err );
	process.exit( 1 );
} );

let _config = null;

exports.loadConfig = () => {
	if ( _config ) {
		return JSON.parse( JSON.stringify( _config ) );
	}

	_config = require( '../config.json' );

	[ 'token', 'logPath', 'fileStoragePath' ].forEach( key => {
		if ( ! _config[ key ] )  {
			throw new Error( util.format(
				'Config key missing: "%s"',
				key
			) );
		}
	} );

	[ 'logPath', 'fileStoragePath' ].forEach( dir => {
		if (
			! fs.existsSync( _config[ dir ] ) ||
			! fs.statSync( _config[ dir ] ).isDirectory()
		) {
			throw new Error( util.format(
				'config.%s must be a directory: %s',
				dir,
				_config[ dir ]
			) );
		}
	} );
	
	return JSON.parse( JSON.stringify( _config ) );
};

function createEventStream( eventCallback ) {
	return new stream.Writable( {
		async write( chunk, encoding, next ) {
			let event = chunk && JSON.parse( chunk );
			if ( event ) {
				await eventCallback( event );
			}
			next();
		},

		// https://gist.github.com/thlorenz/7846391
		decodeStrings: false,
	} );
}

exports.processHistory = eventCallback => {
	const config = exports.loadConfig();

	const files = [];

	walk.walk( config.logPath )
		.on( 'file', ( root, fileStats, next ) => {
			files.push( path.join( root, fileStats.name ) );
			next();
		} )
		.on( 'end', async () => {
			files.sort();
			for ( let f of files ) {
				await new Promise( ( resolve, reject ) => {
					fs.createReadStream( f, { encoding: 'utf8' } )
						.pipe( split() )
						.pipe( createEventStream( eventCallback ) )
						.on( 'error', err => reject( err ) )
						.on( 'finish', resolve );
				} );
			}
		} );
};
