import fs from 'fs';
import path from 'path';
import test from 'ava';
import m from '.';

const cwd = process.cwd();
const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
];

test.before(() => {
	fs.mkdirSync('tmp');
	fixture.forEach(fs.writeFileSync.bind(fs));
	fixture.forEach(x => fs.writeFileSync(path.join(__dirname, 'tmp', x)));
});

test.after(() => {
	fixture.forEach(fs.unlinkSync.bind(fs));
	fixture.forEach(x => fs.unlinkSync(path.join(__dirname, 'tmp', x)));
	fs.rmdirSync('tmp');
});

test('glob - async', async t => {
	t.deepEqual(await m('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob with multiple patterns - async', async t => {
	t.deepEqual(await m(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order - async', async t => {
	t.deepEqual(await m(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync', t => {
	t.deepEqual(m.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(m.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('return [] for all negative patterns - sync', t => {
	t.deepEqual(m.sync(['!a.tmp', '!b.tmp']), []);
});

test('return [] for all negative patterns - async', async t => {
	t.deepEqual(await m(['!a.tmp', '!b.tmp']), []);
});

test('cwd option', t => {
	process.chdir('tmp');
	t.deepEqual(m.sync('*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test(`don't mutate the options object - async`, async t => {
	await m(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test(`don't mutate the options object - sync`, t => {
	m.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = m.generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].opts.ignore, ['c.tmp', 'b.tmp']);
});

test('expose hasMagic', t => {
	t.true(m.hasMagic('**'));
	t.true(m.hasMagic(['**', 'path1', 'path2']));
	t.false(m.hasMagic(['path1', 'path2']));
});

test('expandDirectories option', t => {
	t.deepEqual(m.sync('tmp'), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(m.sync('tmp', {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync('tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync('tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		},
		ignore: ['**/b.tmp']
	}), ['tmp/a.tmp']);
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
	const valstring = v === undefined ?
		'undefined' :
		(JSON.stringify(v) || v.toString());
	const msg = 'patterns must be a string or an array of strings';

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
