const path = require('path');
const test = require('ava');
const slash = require('slash');
const ignoreFiles = require('./ignore');

const gitignorePattern = '**/.gitignore';

test('ignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await ignoreFiles(gitignorePattern, {cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore - mixed path styles', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await ignoreFiles(gitignorePattern, {cwd});
	t.true(isIgnored(slash(path.resolve(cwd, 'foo.js'))));
});

test('ignore - os paths', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await ignoreFiles(gitignorePattern, {cwd});
	t.true(isIgnored(path.resolve(cwd, 'foo.js')));
});

test('ignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = ignoreFiles.sync(gitignorePattern, {cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .ignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = await ignoreFiles(gitignorePattern, {cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .ignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = ignoreFiles.sync(gitignorePattern, {cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('negative ignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = await ignoreFiles(gitignorePattern, {cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative ignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = ignoreFiles.sync(gitignorePattern, {cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation', async t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const isIgnored = await ignoreFiles(gitignorePattern, {cwd});

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
	const isIgnored = ignoreFiles.sync(gitignorePattern, {cwd});

	const actual = [
		'!!!unicorn.js',
		'!!unicorn.js',
		'!unicorn.js',
		'unicorn.js'
	].filter(file => !isIgnored(file));

	const expected = ['!!unicorn.js', '!unicorn.js'];
	t.deepEqual(actual, expected);
});
