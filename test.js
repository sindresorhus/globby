import fs from 'fs';
import util from 'util';
import path from 'path';
import test from 'ava';
import globby from '.';

const cwd = process.cwd();
const tmp = 'tmp';
const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
];

test.before(() => {
	if (!fs.existsSync(tmp)) {
		fs.mkdirSync(tmp);
	}

	for (const element of fixture) {
		fs.writeFileSync(element);
		fs.writeFileSync(path.join(__dirname, tmp, element));
	}
});

test.after(() => {
	for (const element of fixture) {
		fs.unlinkSync(element);
		fs.unlinkSync(path.join(__dirname, tmp, element));
	}

	fs.rmdirSync(tmp);
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

test('cwd option', t => {
	process.chdir(tmp);
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
	t.deepEqual(globby.sync(tmp), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(globby.sync('**', {cwd: tmp}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(globby.sync(tmp, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globby.sync(tmp, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(globby.sync(tmp, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		},
		ignore: ['**/b.tmp']
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', t => {
	t.deepEqual(globby.sync(tmp, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(globby.sync(tmp, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
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
	process.chdir(tmp);
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
	NaN,
	[NaN],
	5,
	[5],
	function () {},
	[function () {}]
].forEach(v => {
	const valstring = util.format(v);
	const msg = 'Patterns must be a string or an array of strings';

	test(`rejects the promise for invalid patterns input: ${valstring} - async`, async t => {
		await t.throwsAsync(globby(v), TypeError);
		await t.throwsAsync(globby(v), msg);
	});

	test(`throws for invalid patterns input: ${valstring}`, t => {
		t.throws(() => globby.sync(v), TypeError);
		t.throws(() => globby.sync(v), msg);
	});

	test(`generateGlobTasks throws for invalid patterns input: ${valstring}`, t => {
		t.throws(() => globby.generateGlobTasks(v), TypeError);
		t.throws(() => globby.generateGlobTasks(v), msg);
	});
});

test('gitignore option defaults to false', async t => {
	const actual = await globby('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('gitignore option defaults to false - sync', t => {
	const actual = globby.sync('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true', async t => {
	const actual = await globby('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true - sync', t => {
	const actual = globby.sync('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false', async t => {
	const actual = await globby('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false - sync', t => {
	const actual = globby.sync('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

// https://github.com/sindresorhus/globby/issues/97
test.failing('`{extension: false}` and `expandDirectories.extensions` option', t => {
	t.deepEqual(
		globby.sync(tmp, {
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

test('`{extension: false}` and `expandDirectories.extensions` option throws error', async t => {
	await t.throwsAsync(globby(tmp, {
		extension: false,
		expandDirectories: {
			extensions: ['md', 'tmp']
		}
	}),
	'Using noext and expandDirectories.extensions together will fail due to upstream bugs. #97'
	);
});

test('`{extension: false}` and `expandDirectories.extensions` option throws error - sync', t => {
	t.throws(
		() =>
			globby.sync(tmp, {
				extension: false,
				expandDirectories: {
					extensions: ['md', 'tmp']
				}
			}),
		'Using noext and expandDirectories.extensions together will fail due to upstream bugs. #97'
	);
});

test('throws when specifying a file as cwd - async', async t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	await t.throwsAsync(
		globby('.', {cwd: isFile}),
		'The `cwd` option must be a path to a directory'
	);

	await t.throwsAsync(
		globby('*', {cwd: isFile}),
		'The `cwd` option must be a path to a directory'
	);
});

test('throws when specifying a file as cwd - sync', t => {
	const isFile = path.resolve('fixtures/gitignore/bar.js');

	t.throws(() => {
		globby.sync('.', {cwd: isFile});
	}, 'The `cwd` option must be a path to a directory');

	t.throws(() => {
		globby.sync('*', {cwd: isFile});
	}, 'The `cwd` option must be a path to a directory');
});
