import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'ava';
import getStream from 'get-stream';
import {
	globby,
	globbySync,
	globbyStream,
	isDynamicPattern,
	generateGlobTasks,
} from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const temporary = 'tmp';

const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp',
];

const getCwdValues = cwd => [cwd, pathToFileURL(cwd), pathToFileURL(cwd).href];
const excludeDirentAndStats = results => results.map(fastGlobResult => {
	// In `objectMode` the `fastGlobResult.dirent` contains function that makes `t.deepEqual` assertion fails.
	// `fastGlobResult.stats` contains different `atime`
	if (typeof fastGlobResult === 'object') {
		const {dirent, stats, ...rest} = fastGlobResult;
		return rest;
	}

	return fastGlobResult;
});
const runGlobby = async (t, patterns, options) => {
	const syncResult = globbySync(patterns, options);
	const promiseResult = await globby(patterns, options);

	// TODO: Use `Array.fromAsync` when Node.js supports it
	const streamResult = await getStream.array(globbyStream(patterns, options));

	t.deepEqual(
		excludeDirentAndStats(syncResult),
		excludeDirentAndStats(promiseResult),
		'globbySync() result differently than globby()',
	);
	t.deepEqual(
		excludeDirentAndStats(streamResult),
		excludeDirentAndStats(promiseResult),
		'globbyStream() result differently than globby()',
	);

	return promiseResult;
};

test.before(() => {
	if (!fs.existsSync(temporary)) {
		fs.mkdirSync(temporary);
	}

	for (const element of fixture) {
		fs.writeFileSync(element, '');
		fs.writeFileSync(path.join(__dirname, temporary, element), '');
	}
});

test.after(() => {
	for (const element of fixture) {
		fs.unlinkSync(element);
		fs.unlinkSync(path.join(__dirname, temporary, element));
	}

	fs.rmdirSync(temporary);
});

test('glob', async t => {
	const result = await runGlobby(t, '*.tmp');
	t.deepEqual(result.sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(await runGlobby(t, '*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(await runGlobby(t, ['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - multiple file paths', async t => {
	t.deepEqual(await runGlobby(t, ['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns', async t => {
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order', async t => {
	t.deepEqual(await runGlobby(t, ['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('return [] for all negative patterns', async t => {
	t.deepEqual(await runGlobby(t, ['!a.tmp', '!b.tmp']), []);
});

test('glob - stream async iterator support', async t => {
	const results = [];
	for await (const path of globbyStream('*.tmp')) {
		results.push(path);
	}

	t.deepEqual(results, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test.serial('cwd option - sync', async t => {
	process.chdir(temporary);
	t.deepEqual(await runGlobby(t, '*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object - async', async t => {
	await runGlobby(t, ['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].options.ignore, ['c.tmp', 'b.tmp']);
	t.notThrows(() => generateGlobTasks('*'));
});

test('expose isDynamicPattern', t => {
	t.true(isDynamicPattern('**'));
	t.true(isDynamicPattern(['**', 'path1', 'path2']));
	t.false(isDynamicPattern(['path1', 'path2']));

	for (const cwdDirectory of getCwdValues(cwd)) {
		t.true(isDynamicPattern('**', {cwd: cwdDirectory}));
	}
});

test('expandDirectories option', async t => {
	t.deepEqual(await runGlobby(t, temporary), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	for (const temporaryDirectory of getCwdValues(temporary)) {
		t.deepEqual(await runGlobby(t, '**', {cwd: temporaryDirectory}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	}

	t.deepEqual(await runGlobby(t, temporary, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(await runGlobby(t, temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(await runGlobby(t, temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
		ignore: ['**/b.tmp'],
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', async t => {
	t.deepEqual(await runGlobby(t, temporary, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', async t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(await runGlobby(t, temporary, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories and ignores option', async t => {
	t.deepEqual(await runGlobby(t, 'tmp', {
		ignore: ['tmp'],
	}), []);

	t.deepEqual(await runGlobby(t, 'tmp/**', {
		expandDirectories: false,
		ignore: ['tmp'],
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.serial.failing('relative paths and ignores option', async t => {
	process.chdir(temporary);
	for (const cwd of getCwdValues(process.cwd())) {
		t.deepEqual(await runGlobby(t, '../tmp', {
			cwd,
			ignore: ['tmp'],
		}), []);
	}

	process.chdir(cwd);
});

// Rejected for being an invalid pattern
for (const value of [
	{},
	[{}],
	true,
	[true],
	false,
	[false],
	null,
	[null],
	undefined,
	[undefined],
	Number.NaN,
	[Number.NaN],
	5,
	[5],
	function () {},
	[function () {}],
]) {
	const valueString = util.format(value);
	const message = 'Patterns must be a string or an array of strings';

	test(`throws for invalid patterns input: ${valueString}`, async t => {
		await t.throwsAsync(globby(t, value), {instanceOf: TypeError, message});
		t.throws(() => globbySync(value), {instanceOf: TypeError, message});
		t.throws(() => globbyStream(value), {instanceOf: TypeError, message});
		t.throws(() => generateGlobTasks(value), {instanceOf: TypeError, message});
		t.throws(() => isDynamicPattern(value), {instanceOf: TypeError, message});
	});
}

test('gitignore option defaults to false - async', async t => {
	const actual = await runGlobby(t, '*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option true', async t => {
	const actual = await runGlobby(t, '*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option false', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option with stats option', async t => {
	const result = await runGlobby(t, '*', {gitignore: true, stats: true});
	const actual = result.map(x => x.path);
	t.false(actual.includes('node_modules'));
});

test('gitignore option with absolute option', async t => {
	const result = await runGlobby(t, '*', {gitignore: true, absolute: true});
	t.false(result.includes('node_modules'));
});

test('gitignore option and objectMode option', async t => {
	const result = await runGlobby(t, 'fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('`{extension: false}` and `expandDirectories.extensions` option', async t => {
	for (const temporaryDirectory of getCwdValues(temporary)) {
		t.deepEqual(
			await runGlobby(t, '*', {
				cwd: temporaryDirectory,
				extension: false,
				expandDirectories: {
					extensions: [
						'md',
						'tmp',
					],
				},
			}),
			[
				'a.tmp',
				'b.tmp',
				'c.tmp',
				'd.tmp',
				'e.tmp',
			],
		);
	}
});

test('throws when specifying a file as cwd', async t => {
	const error = {message: 'The `cwd` option must be a path to a directory'}

	for (const file of getCwdValues(path.resolve('fixtures/gitignore/bar.js'))) {
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('.', {cwd: file}), error);
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('*', {cwd: file}), error);
		t.throws(() => globbySync('.', {cwd: file}), error);
		t.throws(() => globbySync('*', {cwd: file}), error);
		t.throws(() => globbyStream('.', {cwd: file}), error);
		t.throws(() => globbyStream('*', {cwd: file}), error);
	}
});

test('throws when specifying a file as cwd - isDynamicPattern', t => {
	for (const file of getCwdValues(path.resolve('fixtures/gitignore/bar.js'))) {
		t.throws(() => {
			isDynamicPattern('.', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});

		t.throws(() => {
			isDynamicPattern('*', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});
	}
});

test('don\'t throw when specifying a non-existing cwd directory', async t => {
	for (const cwd of getCwdValues('/unknown')) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runGlobby(t, '.', {cwd});
		t.is(actual.length, 0);
	}
});

test('unique when using objectMode option', async t => {
	const result = await runGlobby(t, ['a.tmp', '*.tmp'], {cwd, objectMode: true});
	const isUnique = array => [...new Set(array)].length === array.length;
	t.true(isUnique(result.map(({path}) => path)));
});
