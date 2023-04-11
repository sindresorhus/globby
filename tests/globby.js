import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import test from 'ava';
import getStream from 'get-stream';
import {temporaryDirectory} from 'tempy';
import {
	globby,
	globbySync,
	globbyStream,
	isDynamicPattern,
} from '../index.js';
import {
	PROJECT_ROOT,
	getPathValues,
	invalidPatterns,
	isUnique,
} from './utilities.js';

const cwd = process.cwd();
const temporary = 'tmp';

const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp',
];

const stabilizeResult = result => result
	.map(fastGlobResult => {
		// In `objectMode`, `fastGlobResult.dirent` contains a function that makes `t.deepEqual` assertion fail.
		// `fastGlobResult.stats` contains different `atime`.
		if (typeof fastGlobResult === 'object') {
			const {dirent, stats, ...rest} = fastGlobResult;
			return rest;
		}

		return fastGlobResult;
	})
	.sort((a, b) => (a.path || a).localeCompare(b.path || b));

const runGlobby = async (t, patterns, options) => {
	const syncResult = globbySync(patterns, options);
	const promiseResult = await globby(patterns, options);
	// TODO: Use `Array.fromAsync` when Node.js supports it
	const streamResult = await getStream.array(globbyStream(patterns, options));

	const result = stabilizeResult(promiseResult);
	t.deepEqual(
		stabilizeResult(syncResult),
		result,
		'globbySync() result is different than globby()',
	);
	t.deepEqual(
		stabilizeResult(streamResult),
		result,
		'globbyStream() result is different than globby()',
	);

	return promiseResult;
};

test.before(() => {
	if (!fs.existsSync(temporary)) {
		fs.mkdirSync(temporary);
	}

	for (const element of fixture) {
		fs.writeFileSync(element, '');
		fs.writeFileSync(path.join(PROJECT_ROOT, temporary, element), '');
	}
});

test.after(() => {
	for (const element of fixture) {
		fs.unlinkSync(element);
		fs.unlinkSync(path.join(PROJECT_ROOT, temporary, element));
	}

	fs.rmdirSync(temporary);
});

test('glob', async t => {
	const result = await runGlobby(t, '*.tmp');
	t.deepEqual(result.sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - multiple file paths', async t => {
	t.deepEqual(await runGlobby(t, ['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob - empty patterns', async t => {
	t.deepEqual(await runGlobby(t, []), []);
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

/// test('glob - duplicated patterns', async t => {
// 	const result1 = await runGlobby(t, [`./${temporary}/**`, `./${temporary}`]);
// 	t.deepEqual(result1, ['./tmp/a.tmp', './tmp/b.tmp', './tmp/c.tmp', './tmp/d.tmp', './tmp/e.tmp']);
// 	const result2 = await runGlobby(t, [`./${temporary}`, `./${temporary}/**`]);
// 	t.deepEqual(result2, ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
// });

test.serial('cwd option', async t => {
	process.chdir(temporary);
	t.deepEqual(await runGlobby(t, '*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object', async t => {
	await runGlobby(t, ['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose isDynamicPattern', t => {
	t.true(isDynamicPattern('**'));
	t.true(isDynamicPattern(['**', 'path1', 'path2']));
	t.false(isDynamicPattern(['path1', 'path2']));

	for (const cwdDirectory of getPathValues(cwd)) {
		t.true(isDynamicPattern('**', {cwd: cwdDirectory}));
	}
});

test('expandDirectories option', async t => {
	t.deepEqual(await runGlobby(t, temporary), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	for (const temporaryDirectory of getPathValues(temporary)) {
		// eslint-disable-next-line no-await-in-loop
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

test('absolute:true, expandDirectories:false, onlyFiles:false, gitignore:true and top level folder', async t => {
	const result = await runGlobby(t, '.', {
		absolute: true,
		cwd: path.resolve(temporary),
		expandDirectories: false,
		gitignore: true,
		onlyFiles: false,
	});

	t.is(result.length, 1);
	t.truthy(result[0].endsWith(temporary));
});

test.serial.failing('relative paths and ignores option', async t => {
	process.chdir(temporary);
	for (const cwd of getPathValues(process.cwd())) {
		// eslint-disable-next-line no-await-in-loop
		t.deepEqual(await runGlobby(t, '../tmp', {
			cwd,
			ignore: ['tmp'],
		}), []);
	}

	process.chdir(cwd);
});

// Rejected for being an invalid pattern
for (const value of invalidPatterns) {
	const valueString = util.format(value);
	const message = 'Patterns must be a string or an array of strings';

	test(`throws for invalid patterns input: ${valueString}`, async t => {
		await t.throwsAsync(globby(value), {instanceOf: TypeError, message});
		t.throws(() => globbySync(value), {instanceOf: TypeError, message});
		t.throws(() => globbyStream(value), {instanceOf: TypeError, message});
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

test('gitignore option and suppressErrors option', async t => {
	const temporary = temporaryDirectory();
	fs.mkdirSync(path.join(temporary, 'foo'));
	fs.writeFileSync(path.join(temporary, '.gitignore'), 'baz', 'utf8');
	fs.writeFileSync(path.join(temporary, 'bar'), '', 'utf8');
	fs.writeFileSync(path.join(temporary, 'baz'), '', 'utf8');
	// Block access to "foo", which should be silently ignored.
	fs.chmodSync(path.join(temporary, 'foo'), 0o000);
	const result = await runGlobby(t, '**/*', {cwd: temporary, gitignore: true, suppressErrors: true});
	t.is(result.length, 1);
	t.truthy(result.includes('bar'));
});

test('respects ignoreFiles string option', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: '.gitignore', onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects ignoreFiles array option', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: ['.gitignore'], onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('glob dot files', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: '*gitignore', onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('`{extension: false}` and `expandDirectories.extensions` option', async t => {
	for (const temporaryDirectory of getPathValues(temporary)) {
		t.deepEqual(
			// eslint-disable-next-line no-await-in-loop
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
	const error = {message: 'The `cwd` option must be a path to a directory'};

	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
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
	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		t.throws(() => {
			isDynamicPattern('.', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});

		t.throws(() => {
			isDynamicPattern('*', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});
	}
});

test('don\'t throw when specifying a non-existing cwd directory', async t => {
	for (const cwd of getPathValues('/unknown')) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runGlobby(t, '.', {cwd});
		t.is(actual.length, 0);
	}
});

test('unique when using objectMode option', async t => {
	const result = await runGlobby(t, ['a.tmp', '*.tmp'], {cwd, objectMode: true});
	t.true(isUnique(result.map(({path}) => path)));
});
