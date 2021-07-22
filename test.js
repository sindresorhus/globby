import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import {fileURLToPath} from 'node:url';
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

test('glob - async', async t => {
	t.deepEqual((await globby('*.tmp')).sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - async - multiple file paths', t => {
	t.deepEqual(globbySync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - async', async t => {
	t.deepEqual(await globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - async', async t => {
	t.deepEqual(await globby(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('respect patterns order - sync', t => {
	t.deepEqual(globbySync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync', t => {
	t.deepEqual(globbySync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globbySync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(globbySync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync - multiple file paths', t => {
	t.deepEqual(globbySync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('return [] for all negative patterns - sync', t => {
	t.deepEqual(globbySync(['!a.tmp', '!b.tmp']), []);
});

test('return [] for all negative patterns - async', async t => {
	t.deepEqual(await globby(['!a.tmp', '!b.tmp']), []);
});

test('glob - stream', async t => {
	t.deepEqual((await getStream.array(globbyStream('*.tmp'))).sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - stream async iterator support', async t => {
	const results = [];
	for await (const path of globbyStream('*.tmp')) {
		results.push(path);
	}

	t.deepEqual(results, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - stream - multiple file paths', async t => {
	t.deepEqual(await getStream.array(globbyStream(['a.tmp', 'b.tmp'])), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - stream', async t => {
	t.deepEqual(await getStream.array(globbyStream(['a.tmp', '*.tmp', '!{c,d,e}.tmp'])), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - stream', async t => {
	t.deepEqual(await getStream.array(globbyStream(['!*.tmp', 'a.tmp'])), ['a.tmp']);
});

test('return [] for all negative patterns - stream', async t => {
	t.deepEqual(await getStream.array(globbyStream(['!a.tmp', '!b.tmp'])), []);
});

test('cwd option', t => {
	process.chdir(temporary);
	t.deepEqual(globbySync('*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globbySync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object - async', async t => {
	await globby(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('don\'t mutate the options object - sync', t => {
	globbySync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('don\'t mutate the options object - stream', async t => {
	await getStream.array(globbyStream(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])})));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].options.ignore, ['c.tmp', 'b.tmp']);
});

test('expose isDynamicPattern', t => {
	t.true(isDynamicPattern('**'));
	t.true(isDynamicPattern(['**', 'path1', 'path2']));
	t.false(isDynamicPattern(['path1', 'path2']));
});

test('expandDirectories option', t => {
	t.deepEqual(globbySync(temporary), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(globbySync('**', {cwd: temporary}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globbySync(temporary, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globbySync(temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globbySync(temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
		ignore: ['**/b.tmp'],
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', t => {
	t.deepEqual(globbySync(temporary, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(globbySync(temporary, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories and ignores option', t => {
	t.deepEqual(globbySync('tmp', {
		ignore: ['tmp'],
	}), []);

	t.deepEqual(globbySync('tmp/**', {
		expandDirectories: false,
		ignore: ['tmp'],
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('relative paths and ignores option', t => {
	process.chdir(temporary);
	t.deepEqual(globbySync('../tmp', {
		cwd: process.cwd(),
		ignore: ['tmp'],
	}), []);
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

	test(`rejects the promise for invalid patterns input: ${valueString} - async`, async t => {
		await t.throwsAsync(globby(value), {instanceOf: TypeError});
		await t.throwsAsync(globby(value), {message});
	});

	test(`throws for invalid patterns input: ${valueString} - sync`, t => {
		t.throws(() => {
			globbySync(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			globbySync(value);
		}, {message});
	});

	test(`throws for invalid patterns input: ${valueString} - stream`, t => {
		t.throws(() => {
			globbyStream(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			globbyStream(value);
		}, {message});
	});

	test(`generateGlobTasks throws for invalid patterns input: ${valueString}`, t => {
		t.throws(() => {
			generateGlobTasks(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			generateGlobTasks(value);
		}, {message});
	});
}

test('gitignore option defaults to false - async', async t => {
	const actual = await globby('*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option defaults to false - sync', t => {
	const actual = globbySync('*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option defaults to false - stream', async t => {
	const actual = await getStream.array(globbyStream('*', {onlyFiles: false}));
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option true - async', async t => {
	const actual = await globby('*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option true - sync', t => {
	const actual = globbySync('*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option true - stream', async t => {
	const actual = await getStream.array(globbyStream('*', {gitignore: true, onlyFiles: false}));
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option false - async', async t => {
	const actual = await globby('*', {gitignore: false, onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option false - sync', t => {
	const actual = globbySync('*', {gitignore: false, onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option with stats option', async t => {
	const result = await globby('*', {gitignore: true, stats: true});
	const actual = result.map(x => x.path);
	t.false(actual.includes('node_modules'));
});

test('gitignore option with absolute option', async t => {
	const result = await globby('*', {gitignore: true, absolute: true});
	t.false(result.includes('node_modules'));
});

test('respects gitignore option false - stream', async t => {
	const actual = await getStream.array(globbyStream('*', {gitignore: false, onlyFiles: false}));
	t.true(actual.includes('node_modules'));
});

test('gitingore option and objectMode option - async', async t => {
	const result = await globby('fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('gitingore option and objectMode option - sync', t => {
	const result = globbySync('fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('`{extension: false}` and `expandDirectories.extensions` option', t => {
	t.deepEqual(
		globbySync('*', {
			cwd: temporary,
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
});

test('throws when specifying a file as cwd - async', async t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	await t.throwsAsync(
		globby('.', {cwd: isFile}),
		{message: 'The `cwd` option must be a path to a directory'},
	);

	await t.throwsAsync(
		globby('*', {cwd: isFile}),
		{message: 'The `cwd` option must be a path to a directory'},
	);
});

test('throws when specifying a file as cwd - sync', t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	t.throws(() => {
		globbySync('.', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});

	t.throws(() => {
		globbySync('*', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});
});

test('throws when specifying a file as cwd - stream', t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	t.throws(() => {
		globbyStream('.', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});

	t.throws(() => {
		globbyStream('*', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});
});

test('don\'t throw when specifying a non-existing cwd directory - async', async t => {
	const actual = await globby('.', {cwd: '/unknown'});
	t.is(actual.length, 0);
});

test('don\'t throw when specifying a non-existing cwd directory - sync', t => {
	const actual = globbySync('.', {cwd: '/unknown'});
	t.is(actual.length, 0);
});
