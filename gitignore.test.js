import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import slash from 'slash';
import {isGitIgnored, isGitIgnoredSync} from './gitignore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await isGitIgnored({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('gitignore - mixed path styles', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await isGitIgnored({cwd});
	t.true(isIgnored(slash(path.resolve(cwd, 'foo.js'))));
});

test('gitignore - os paths', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = await isGitIgnored({cwd});
	t.true(isIgnored(path.resolve(cwd, 'foo.js')));
});

test('gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const isIgnored = isGitIgnoredSync({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = await isGitIgnored({cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const ignore = ['**/.gitignore'];

	const isIgnored = isGitIgnoredSync({cwd, ignore});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js', 'bar.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = await isGitIgnored({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const isIgnored = isGitIgnoredSync({cwd});
	const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation', async t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const isIgnored = await isGitIgnored({cwd});

	const actual = [
		'!!!unicorn.js',
		'!!unicorn.js',
		'!unicorn.js',
		'unicorn.js',
	].filter(file => !isIgnored(file));

	const expected = ['!!unicorn.js', '!unicorn.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const isIgnored = isGitIgnoredSync({cwd});

	const actual = [
		'!!!unicorn.js',
		'!!unicorn.js',
		'!unicorn.js',
		'unicorn.js',
	].filter(file => !isIgnored(file));

	const expected = ['!!unicorn.js', '!unicorn.js'];
	t.deepEqual(actual, expected);
});
