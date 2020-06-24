#!/usr/bin/env node

const a = 1 // eslint-disable-line no-unused-vars
	, Bluebird = require( 'bluebird' )
	, chalk = require( 'chalk' )
	, childProcess = require( 'child_process' )
	, console = require( 'console' )
	, lodash = require( 'lodash' )
	, process = require( 'process' )
	, yargs = require( 'yargs' )
	, yargsUnparser = require( 'yargs-unparser' )
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
		err.message = reason;
		err.stack = reason + '\nCaused by:\n' + separator + cause.stack.replace( /\n/g, '\n' + separator );
		throw err;
	};
}

async function handleCheckout( args ) {

	// Recreate the original command (for debug purposes only).
	let command = [ args.$0, ...yargsUnparser( args, { command: '<issueNumber>', default: { remoteName: 'origin' } } ) ].join( ' ' );
	// console.debug( command );

	// Parse arguments.
	let { remoteName, issueNumber, selectBranch, rebase } = args;
	// console.debug( remoteName, issueNumber, selectBranch, rebase, args );

	// Create a regexp that matches the expected branch name for the given issue.
	const remoteRegEx = new RegExp( `^${ remoteName }/(${ issueNumber }-[A-z0-9-]+)$` );

	// Try to fetch remote branches.
	await gitFetchRemote( remoteName ).catch( rethrow( 'Failed to fetch remote repository' ) );

	// Read all available branches.
	let remoteBranchesRaw = await execute( 'git branch -r' ).catch( rethrow( 'Failed to list remote branches' ) );
	let remoteBranches = lodash.chain( remoteBranchesRaw )
		.split( '\n' )
		.map( lodash.trim )
		.value();

	let remoteBranchName;
	if ( selectBranch ) {
		remoteBranchName = remoteBranches.find( x => x === selectBranch );
		if ( !remoteBranchName ) {
			throw new Error( `No branch named ${ selectBranch } exists.` );
		}
	} else {
		let issueRemoteBranches = lodash.filter( remoteBranches, remoteRegEx.test.bind( remoteRegEx ) );
		if ( issueRemoteBranches.length === 0 ) {
			throw new Error( `No branch found for issue ${ issueNumber }. Please ensure the issue number is correct and that a branch has been created using default name settings.` );
		} else if ( issueRemoteBranches.length > 1 ) {
			throw new Error( `${ issueRemoteBranches.length } branches found for issue ${ issueNumber }:\n${ issueRemoteBranches.map( ( v, i ) => `${ i + 1 }. ${ v }` ).join( '\n' ) }\n\nRelaunch using: ${ chalk.cyan( command + ' --select-branch <name>' ) }` );
		} else {
			remoteBranchName = issueRemoteBranches[0];
		}
	}

	let [ , localBranchName ] = remoteBranchName.match( remoteRegEx );
	let [ err ] = await wrap( lodash.partial( execute, `git show ${ localBranchName }` ) );
	if ( err && err.code && err.code === 128 /* no ref found */ ) {
		await execute( `git checkout -b ${ localBranchName } ${ remoteBranchName }` ).catch( rethrow( 'Failed to checkout remote branch' ) );
		console.info( chalk.green( `✔ Succesfully created and moved to branch ${ localBranchName }.` ) );
	} else {
		await execute( `git checkout ${ localBranchName }` );
		[ err ] = await wrap( lodash.partial( execute,  `git merge --ff-only ${ remoteBranchName }` ) );
		if ( err ) {
			if ( rebase ) {
				await execute( `git rebase ${ remoteBranchName } --autostash` ).catch( rethrow( `Failed to rebase on top of ${ remoteBranchName }` ) );
				console.info( chalk.green( `✔ Succesfully updated local branch ${ localBranchName }.` ) );
			} else {
				rethrow( `Could not apply remote changes: History is non-fast forward.\nRebase using: ${ chalk.cyan( command + ' --rebase' ) }` )( err );
			}
		} else {
			console.info( chalk.green( `✔ Succesfully switched to local branch ${ localBranchName }.` ) );
		}
	}

}

async function main() {

	yargs
		.scriptName( 'gfc' )
		.command( '$0 [issueNumber]', 'Checkouts a branch, given its GitLab issue number', {
			issueNumber: {
				type: 'string',
				demandOption: true,
				coerce: input => {
					if (!input.match(/^\s*#?[1-9][0-9]*\s*$/))
						throw new Error( 'Invalid issue number: integer expected, got: ' + input );
					return parseInt(input);
				}
			},
			remoteName: {
				type: 'string',
				demandOption: "Please specify the remote name",
				requiresArg: true,
				default: 'origin'
			},
			selectBranch: {
				type: 'string',
				hidden: true,
				requiresArg: true
			},
			rebase: {
				type: 'boolean',
				hidden: true
			}
		}, handleCheckout )
		.demandCommand(1, 1, 'Please specify a valid command.')
		.help()
		.strict()
		.showHelpOnFail( false, 'Specify --help for available options' )
		.parse( process.argv.slice( 2 ) );

}

main()
	.catch( e => console.error( 'Failed to gitlab checkout: ', e ) );
