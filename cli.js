#!/usr/bin/env node

const a = 1 // eslint-disable-line no-unused-vars
	, Bluebird = require( 'bluebird' )
	, chalk = require( 'chalk' )
	, childProcess = require( 'child_process' )
	, console = require( 'console' )
	, lodash = require( 'lodash' )
	, process = require( 'process' )
	, yargs = require( 'yargs' )
	;

async function execute( cmd ) {
	return new Bluebird( ( resolve, reject ) => {
		childProcess.exec( cmd, ( err, stdout, stderr ) => {
			if ( err ) return reject( err );
			return resolve( stdout.trim() );
		} );
	} ).delay( 150 );
}

async function gitFetchRemote( remote = 'origin' ) {
	const cmd = 'git', args = [ 'fetch', remote ];
	return new Bluebird( ( resolve, reject ) => {
		let spawnedProcess = childProcess.spawn( cmd, args, {
			stdio: [ process.stdin, null, process.stderr ]
		} );
		spawnedProcess.on( 'close', code => {
			if ( code === 0 )
				return resolve();
			return reject( new Error( 'Child process did not exit succesfully: ' + code ) );
		} );
	} ).delay( 150 );
}

async function wrap( fn ) {
	return Bluebird.resolve()
		.then( () => fn.call( null ) )
		.then( data => [ null, data ], err => [ err ] );
}

function rethrow( reason ) {
	return function( cause ) {
		const separator = '  ', err = new Error( reason );
		err.stack += '\nCaused by:\n' + separator + cause.stack.replace( /\n/g, '\n' + separator );
		throw err;
	};
}

async function handleCheckout( args ) {

	let { remoteName, issueNumber, selectBranch } = args;
	
	const remoteRegEx = new RegExp( `^${ remoteName }/(${ issueNumber }-[A-z0-9-]+)$` );

	await gitFetchRemote( remoteName ).catch( rethrow( 'Failed to fetch remote repository' ) );
	let remoteBranchesRaw = await execute( 'git branch -r' ).catch( rethrow( 'Failed to list remote branches' ) );

	let remoteBranches = lodash( remoteBranchesRaw )
		.split( '\n' )
		.map( lodash.trim )
		.filter( remoteRegEx.test.bind( remoteRegEx ) )
		.value();

	let remoteBranchName;
	if ( remoteBranches.length === 0 ) {
		throw new Error( `No branch found for issue ${ issueNumber }. Please ensure the issue number is correct and that a branch has been created using default name settings.` );
	} else if ( remoteBranches.length > 1 ) {
		if ( selectBranch === null )
			throw new Error( `${ remoteBranches.length } branches found for issue ${ issueNumber }:\n${ remoteBranches.map( ( v, i ) => `${ i+1 }. ${ v }` ).join( '\n' ) }\n\nUse --selectBranch <name> to select the correct branch.` );
		remoteBranchName = remoteBranches.find( x => x === selectBranch );
		if ( !remoteBranchName )
			throw new Error( `No branch named ${ selectBranch } exists for issue ${ issueNumber }` );
	} else {
		remoteBranchName = remoteBranches[0];
	}

	let [ , localBranchName ] = remoteBranchName.match( remoteRegEx );
	let [ err ] = await wrap( lodash.partial( execute, `git show ${ localBranchName }` ) );
	if ( err && err.code && err.code === 128 /* no ref found */ ) {
		await execute( `git checkout -b ${ localBranchName } ${ remoteBranchName }` ).catch( rethrow( 'Failed to checkout remote branch' ) );
		console.info( chalk.green( `✔ Succesfully created and moved to branch ${ localBranchName }.` ) );
	} else {
		await execute( `git checkout ${ localBranchName }` );
		console.info( chalk.green( `✔ Succesfully switched to local branch ${ localBranchName }.` ) );
	}


}

async function main() {

	yargs
		.scriptName( 'gfc' )
		.command( '$0 <issue-number>', 'Checkouts a branch, given its GitLab issue number', {
			issueNumber: {
				type: 'number',
				required: true
			},
			remoteName: {
				type: 'string',
				required: true,
				requiresArg: true,
				default: 'origin'
			},
			selectBranch: {
				type: 'string',
				hidden: true,
				requiresArg: true
			}
		}, handleCheckout )
		.demandCommand()
		.help()
		.showHelpOnFail( false, 'Specify --help for available options' )
		.parse( process.argv.slice( 2 ) );

}

main()
	.catch( e => console.error( 'Failed to gitlab checkout: ', e ) );