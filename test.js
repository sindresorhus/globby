import fs from 'fs';
import util from 'util';
import path from 'path';
import test from 'ava';
import m from '.';

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
	fixture.forEach(fs.writeFileSync.bind(fs));
	fixture.forEach(x => fs.writeFileSync(path.join(__dirname, tmp, x)));
});

test.after(() => {
	fixture.forEach(fs.unlinkSync.bind(fs));
	fixture.forEach(x => fs.unlinkSync(path.join(__dirname, tmp, x)));
	fs.rmdirSync(tmp);
});

test('glob - async', async t => {
	t.deepEqual(await m('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - async - multiple file paths', t => {
	t.deepEqual(m.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - async', async t => {
	t.deepEqual(await m(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - async', async t => {
	t.deepEqual(await m(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('respect patterns order - sync', t => {
	t.deepEqual(m.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync', t => {
	t.deepEqual(m.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(m.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync - multiple file paths', t => {
	t.deepEqual(m.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('return [] for all negative patterns - sync', t => {
	t.deepEqual(m.sync(['!a.tmp', '!b.tmp']), []);
});

test('return [] for all negative patterns - async', async t => {
	t.deepEqual(await m(['!a.tmp', '!b.tmp']), []);
});

test('cwd option', t => {
	process.chdir(tmp);
	t.deepEqual(m.sync('*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object - async', async t => {
	await m(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('don\'t mutate the options object - sync', t => {
	m.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = m.generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].options.ignore, ['c.tmp', 'b.tmp']);
});

test('expose hasMagic', t => {
	t.true(m.hasMagic('**'));
	t.true(m.hasMagic(['**', 'path1', 'path2']));
	t.false(m.hasMagic(['path1', 'path2']));
});

test('expandDirectories option', t => {
	t.deepEqual(m.sync(tmp), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(m.sync('**', {cwd: tmp}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(tmp, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync(tmp, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync(tmp, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		},
		ignore: ['**/b.tmp']
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', t => {
	t.deepEqual(m.sync(tmp, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(m.sync(tmp, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories and ignores option', t => {
	t.deepEqual(m.sync('tmp', {
		ignore: ['tmp']
	}), []);

	t.deepEqual(m.sync('tmp/**', {
		expandDirectories: false,
		ignore: ['tmp']
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('relative paths and ignores option', t => {
	process.chdir(tmp);
	t.deepEqual(m.sync('../tmp', {
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
		await t.throws(m(v), TypeError);
		await t.throws(m(v), msg);
	});

	test(`throws for invalid patterns input: ${valstring}`, t => {
		t.throws(() => m.sync(v), TypeError);
		t.throws(() => m.sync(v), msg);
	});

	test(`generateGlobTasks throws for invalid patterns input: ${valstring}`, t => {
		t.throws(() => m.generateGlobTasks(v), TypeError);
		t.throws(() => m.generateGlobTasks(v), msg);
	});
});

test('gitignore option defaults to false', async t => {
	const actual = await m('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('gitignore option defaults to false - sync', t => {
	const actual = m.sync('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true', async t => {
	const actual = await m('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true - sync', t => {
	const actual = m.sync('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false', async t => {
	const actual = await m('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false - sync', t => {
	const actual = m.sync('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

// https://github.com/sindresorhus/globby/issues/97
test.failing('`{extension: false}` and `expandDirectories.extensions` option', t => {
	t.deepEqual(
		m.sync(tmp, {
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
