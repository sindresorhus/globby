import path from 'node:path';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {globby, globbyStream} from '../index.js';
import {
	createContextAwareFs,
	setGitConfigGlobal,
	createGlobalGitignoreConfig,
} from './utilities.js';

test.serial('globalGitignore option - globby requires async stat when a custom fs is provided', async t => {
	const subdirectory = path.join(temporaryDirectory(), 'virtual', 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);
	fsImplementation.stat = undefined;
	fsImplementation.promises.stat = undefined;

	const error = await t.throwsAsync(async () => {
		await globby('**/*', {cwd: subdirectory, fs: fsImplementation, globalGitignore: true});
	});

	t.is(
		error.message,
		'The `globalGitignore` option in `globby()` and `globbyStream()` requires `fs.promises.stat` or `fs.stat` when a custom `fs` is provided.',
	);
});

test.serial('globalGitignore option - globbyStream requires async stat when a custom fs is provided', async t => {
	const subdirectory = path.join(temporaryDirectory(), 'virtual', 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);
	fsImplementation.stat = undefined;
	fsImplementation.promises.stat = undefined;

	const error = await t.throwsAsync(async () => {
		const result = [];
		for await (const _file of globbyStream('**/*', {cwd: subdirectory, fs: fsImplementation, globalGitignore: true})) {
			result.push(_file);
		}
	});

	t.is(
		error.message,
		'The `globalGitignore` option in `globby()` and `globbyStream()` requires `fs.promises.stat` or `fs.stat` when a custom `fs` is provided.',
	);
});
