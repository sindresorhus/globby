import fs from 'fs';
import test from 'ava';
import m from './';

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
});

test.after(() => {
	fs.rmdirSync('tmp');
	fixture.forEach(fs.unlinkSync.bind(fs));
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
	t.deepEqual(m.sync('*.tmp', {cwd: cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd: cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test(`don't mutate the options object - async`, async () => {
	await m(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
});

test(`don't mutate the options object - sync`, () => {
	m.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
});

test('expose generateGlobTasks', t => {
	const tasks = m.generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].opts.ignore, ['c.tmp', 'b.tmp']);
});
