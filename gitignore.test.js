import fs from 'fs';
import path from 'path';
import test from 'ava';
import gitignore from './gitignore';

test('gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await gitignore({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = await gitignore({cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = gitignore.sync({cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = await gitignore({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation', async t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const isIgnored = await gitignore({cwd});

	const actual = [
		'!!!unicorn.js',
		'!!unicorn.js',
		'!unicorn.js',
		'unicorn.js'
	].filter(file => !isIgnored(file));

	const expected = ['!!unicorn.js', '!unicorn.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const isIgnored = gitignore.sync({cwd});

	const actual = [
		'!!!unicorn.js',
		'!!unicorn.js',
		'!unicorn.js',
		'unicorn.js'
	].filter(file => !isIgnored(file));

	const expected = ['!!unicorn.js', '!unicorn.js'];
	t.deepEqual(actual, expected);
});

test('gitignore nested 1 level', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/');
	const isIgnored = await gitignore({cwd});
	const actual = ['bar.js', 'foo.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];

	t.deepEqual(actual, expected);
});

test('gitignore nested 1 level - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/');
	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];

	t.deepEqual(actual, expected);
});

test('gitignore nested 2 levels', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-2');
	const isIgnored = await gitignore({cwd});
	const actual = ['foo.js', 'bar.js', 'baz.js'].filter(file => !isIgnored(file));
	const expected = ['baz.js'];

	t.deepEqual(actual, expected);
});

test('gitignore nested 2 levels - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-2');
	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js', 'bar.js', 'baz.js'].filter(file => !isIgnored(file));
	const expected = ['baz.js'];

	t.deepEqual(actual, expected);
});

test('gitignore nested directory', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-3');
	const isIgnored = await gitignore({cwd});
	const actual = ['foo.js'].filter(file => !isIgnored(file));
	const expected = [];

	t.deepEqual(actual, expected);
});

test('gitignore nested directory - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-3');
	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js'].filter(file => !isIgnored(file));
	const expected = [];

	t.deepEqual(actual, expected);
});

test('gitignore does not read ignore files above git root directory', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-4');
	await fs.promises.mkdir(path.join(cwd, '.git'), {recursive: true});

	const isIgnored = await gitignore({cwd});
	const actual = ['foo.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];

	t.deepEqual(actual, expected);
});

test('gitignore does not read ignore files above git root directory - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore/nested-1/nested-4');
	fs.mkdirSync(path.join(cwd, '.git'), {recursive: true});

	const isIgnored = gitignore.sync({cwd});
	const actual = ['foo.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];

	t.deepEqual(actual, expected);
});
