import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'ava';
import slash from 'slash';
import {isGitIgnored, isGitIgnoredSync} from './gitignore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const getCwdValues = cwd => [cwd, pathToFileURL(cwd)];

test('gitignore', async t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/gitignore'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('gitignore - mixed path styles', async t => {
	const directory = path.join(__dirname, 'fixtures/gitignore');
	for (const cwd of getCwdValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		t.true(isIgnored(slash(path.resolve(directory, 'foo.js'))));
	}
});

test('gitignore - os paths', async t => {
	const directory = path.join(__dirname, 'fixtures/gitignore');
	for (const cwd of getCwdValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		t.true(isIgnored(path.resolve(directory, 'foo.js')));
	}
});

test('gitignore - sync', t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/gitignore'))) {
		const isIgnored = isGitIgnoredSync({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('ignore ignored .gitignore', async t => {
	const ignore = ['**/.gitignore'];

	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/gitignore'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd, ignore});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js', 'bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('ignore ignored .gitignore - sync', t => {
	const ignore = ['**/.gitignore'];

	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/gitignore'))) {
		const isIgnored = isGitIgnoredSync({cwd, ignore});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js', 'bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative gitignore', async t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/negative'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative gitignore - sync', t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/negative'))) {
		const isIgnored = isGitIgnoredSync({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation', async t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/multiple-negation'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});

		const actual = [
			'!!!unicorn.js',
			'!!unicorn.js',
			'!unicorn.js',
			'unicorn.js',
		].filter(file => !isIgnored(file));

		const expected = ['!!unicorn.js', '!unicorn.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation - sync', t => {
	for (const cwd of getCwdValues(path.join(__dirname, 'fixtures/multiple-negation'))) {
		const isIgnored = isGitIgnoredSync({cwd});

		const actual = [
			'!!!unicorn.js',
			'!!unicorn.js',
			'!unicorn.js',
			'unicorn.js',
		].filter(file => !isIgnored(file));

		const expected = ['!!unicorn.js', '!unicorn.js'];
		t.deepEqual(actual, expected);
	}
});
