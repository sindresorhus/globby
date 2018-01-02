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

test('use other ignore file', async t => {
	const cwd = path.join(__dirname, 'fixtures/otherignore');
	const filename = '.otherignore';
	const isIgnored = await gitignore({cwd, filename});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('use other ignore file - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/otherignore');
	const filename = '.otherignore';
	const isIgnored = gitignore.sync({cwd, filename});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
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
