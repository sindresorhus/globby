const fs = require('fs');
const util = require('util');
const path = require('path');
const test = require('ava');
const getStream = require('get-stream');
const globby = require('.');

const cwd = process.cwd();
const temporary = 'tmp';

const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
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
	t.deepEqual(globby.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - async', async t => {
	t.deepEqual(await globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - async', async t => {
	t.deepEqual(await globby(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('respect patterns order - sync', t => {
	t.deepEqual(globby.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync', t => {
	t.deepEqual(globby.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(globby.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync - multiple file paths', t => {
	t.deepEqual(globby.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('return [] for all negative patterns - sync', t => {
	t.deepEqual(globby.sync(['!a.tmp', '!b.tmp']), []);
});

test('return [] for all negative patterns - async', async t => {
	t.deepEqual(await globby(['!a.tmp', '!b.tmp']), []);
});

test('glob - stream', async t => {
	t.deepEqual((await getStream.array(globby.stream('*.tmp'))).sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - stream async iterator support', async t => {
	const results = [];
	for await (const path of globby.stream('*.tmp')) {
		results.push(path);
	}

	t.deepEqual(results, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - stream - multiple file paths', async t => {
	t.deepEqual(await getStream.array(globby.stream(['a.tmp', 'b.tmp'])), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - stream', async t => {
	t.deepEqual(await getStream.array(globby.stream(['a.tmp', '*.tmp', '!{c,d,e}.tmp'])), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - stream', async t => {
	t.deepEqual(await getStream.array(globby.stream(['!*.tmp', 'a.tmp'])), ['a.tmp']);
});

test('return [] for all negative patterns - stream', async t => {
	t.deepEqual(await getStream.array(globby.stream(['!a.tmp', '!b.tmp'])), []);
});

test('cwd option', t => {
	process.chdir(temporary);
	t.deepEqual(globby.sync('*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object - async', async t => {
	await globby(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('don\'t mutate the options object - sync', t => {
	globby.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('don\'t mutate the options object - stream', async t => {
	await getStream.array(globby.stream(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])})));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = globby.generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].options.ignore, ['c.tmp', 'b.tmp']);
});

test('expose hasMagic', t => {
	t.true(globby.hasMagic('**'));
	t.true(globby.hasMagic(['**', 'path1', 'path2']));
	t.false(globby.hasMagic(['path1', 'path2']));
});

test('expandDirectories option', t => {
	t.deepEqual(globby.sync(temporary), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(globby.sync('**', {cwd: temporary}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globby.sync(temporary, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globby.sync(temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globby.sync(temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		},
		ignore: ['**/b.tmp']
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', t => {
	t.deepEqual(globby.sync(temporary, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(globby.sync(temporary, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories and ignores option', t => {
	t.deepEqual(globby.sync('tmp', {
		ignore: ['tmp']
	}), []);

	t.deepEqual(globby.sync('tmp/**', {
		expandDirectories: false,
		ignore: ['tmp']
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('relative paths and ignores option', t => {
	process.chdir(temporary);
	t.deepEqual(globby.sync('../tmp', {
		cwd: process.cwd(),
		ignore: ['tmp']
	}), []);
	process.chdir(cwd);
});

// Rejected for being an invalid pattern
[
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
	[function () {}]
].forEach(value => {
	const valueString = util.format(value);
	const message = 'Patterns must be a string or an array of strings';

	test(`rejects the promise for invalid patterns input: ${valueString} - async`, async t => {
		await t.throwsAsync(globby(value), {instanceOf: TypeError});
		await t.throwsAsync(globby(value), {message});
	});

	test(`throws for invalid patterns input: ${valueString} - sync`, t => {
		t.throws(() => {
			globby.sync(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			globby.sync(value);
		}, {message});
	});

	test(`throws for invalid patterns input: ${valueString} - stream`, t => {
		t.throws(() => {
			globby.stream(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			globby.stream(value);
		}, {message});
	});

	test(`generateGlobTasks throws for invalid patterns input: ${valueString}`, t => {
		t.throws(() => {
			globby.generateGlobTasks(value);
		}, {instanceOf: TypeError});

		t.throws(() => {
			globby.generateGlobTasks(value);
		}, {message});
	});
});

test('gitignore option defaults to false - async', async t => {
	const actual = await globby('*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option defaults to false - sync', t => {
	const actual = globby.sync('*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option defaults to false - stream', async t => {
	const actual = await getStream.array(globby.stream('*', {onlyFiles: false}));
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option true - async', async t => {
	const actual = await globby('*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option true - sync', t => {
	const actual = globby.sync('*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option true - stream', async t => {
	const actual = await getStream.array(globby.stream('*', {gitignore: true, onlyFiles: false}));
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option false - async', async t => {
	const actual = await globby('*', {gitignore: false, onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option false - sync', t => {
	const actual = globby.sync('*', {gitignore: false, onlyFiles: false});
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
	const actual = await getStream.array(globby.stream('*', {gitignore: false, onlyFiles: false}));
	t.true(actual.includes('node_modules'));
});

test('gitingore option and objectMode option - async', async t => {
	const result = await globby('fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('gitingore option and objectMode option - sync', t => {
	const result = globby.sync('fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('`{extension: false}` and `expandDirectories.extensions` option', t => {
	t.deepEqual(
		globby.sync('*', {
			cwd: temporary,
			extension: false,
			expandDirectories: {
				extensions: [
					'md',
					'tmp'
				]
			}
		}),
		[
			'a.tmp',
			'b.tmp',
			'c.tmp',
			'd.tmp',
			'e.tmp'
		]
	);
});

test('throws when specifying a file as cwd - async', async t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	await t.throwsAsync(
		globby('.', {cwd: isFile}),
		{message: 'The `cwd` option must be a path to a directory'}
	);

	await t.throwsAsync(
		globby('*', {cwd: isFile}),
		{message: 'The `cwd` option must be a path to a directory'}
	);
});

test('throws when specifying a file as cwd - sync', t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	t.throws(() => {
		globby.sync('.', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});

	t.throws(() => {
		globby.sync('*', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});
});

test('throws when specifying a file as cwd - stream', t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	t.throws(() => {
		globby.stream('.', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});

	t.throws(() => {
		globby.stream('*', {cwd: isFile});
	}, {message: 'The `cwd` option must be a path to a directory'});
});

test('don\'t throw when specifying a non-existing cwd directory - async', async t => {
	const actual = await globby('.', {cwd: '/unknown'});
	t.is(actual.length, 0);
});

test('don\'t throw when specifying a non-existing cwd directory - sync', t => {
	const actual = globby.sync('.', {cwd: '/unknown'});
	t.is(actual.length, 0);
});
