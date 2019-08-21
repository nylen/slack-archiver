const fs     = require( 'fs' );
const path   = require( 'path' );
const stream = require( 'stream' );
const util   = require( 'util' );

const dayjs = require( 'dayjs' );
const split = require( 'split' );
const walk  = require( 'walk' );

dayjs.extend( require( 'dayjs/plugin/utc' ) );

// https://github.com/nodejs/node/issues/17871 :(
// process.throwDeprecation = true;
process.on( 'unhandledRejection', err => {
	console.error( 'Unhandled promise rejection:', err );
	process.exit( 1 );
} );

let _config = null;

let _currentLogFile = null;
let _currentHour = null;
let _running = true;

exports.logEvent = ( logPath, event ) => {
	let friendlyType = event.type;
	if ( event.subtype ) {
		friendlyType += '.' + event.subtype;
	}

	if ( ! _running ) {
		console.error(
			'Skipping event: %s',
			friendlyType
		);
		return;
	}

	const lastHour = _currentHour;
	_currentHour = dayjs.utc(event.ts ? +event.ts * 1000 : undefined)
		.format( 'YYYY-MM-DD_HH' );

	if ( _currentHour !== lastHour && _currentLogFile ) {
		console.error(
			'%s: Closing log',
			lastHour
		);
		_currentLogFile.end();
		_currentLogFile = null;
	}

	if ( ! _currentLogFile ) {
		const currentMonth = _currentHour.substring( 0, 7 );
		console.error(
			'%s: Opening log',
			_currentHour
		);
		try {
			fs.mkdirSync( path.join( logPath, currentMonth ) );
		} catch ( err ) {
			if ( err.code !== 'EEXIST' ) {
				throw err;
			}
		}
		_currentLogFile = fs.createWriteStream(
			path.join( logPath, currentMonth, _currentHour + '.log' ),
			{ flags: 'a' }
		);
	}

	console.error(
		'%s: Writing event: %s',
		_currentHour,
		friendlyType
	);
	const ok = _currentLogFile.write( JSON.stringify( event ) + '\n' );
	if ( ! ok ) {
		console.error(
			'%s: WARNING: write() returned false!',
			lastHour
		);
	}
};

exports.isLogging = () => _running;

exports.stopLogging = () => {
	_running = false;
};

exports.closeLogFile = ( callback ) => {
	if ( _currentLogFile ) {
		_currentLogFile.end( () => {
			_currentLogFile = null;
			callback();
		} );
	} else {
		process.nextTick( callback );
	}
};

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
