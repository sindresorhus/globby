import path from 'node:path';
import test from 'ava';
import slash from 'slash';
import {
	GITIGNORE_FILES_PATTERN,
	isIgnoredByIgnoreFiles,
	isIgnoredByIgnoreFilesSync,
	isGitIgnored,
	isGitIgnoredSync,
} from '../ignore.js';
import {
	PROJECT_ROOT,
	getPathValues,
} from './utilities.js';

test('ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/gitignore'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored  = await isGitIgnored({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('ignore - mixed path styles', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		t.true(isIgnored(slash(path.resolve(directory, 'foo.js'))));
	}
});

test('ignore - os paths', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		t.true(isIgnored(path.resolve(directory, 'foo.js')));
	}
});

test('ignore - sync', t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/gitignore'))) {
		const isIgnored = isGitIgnoredSync({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/negative'))) {
		// eslint-disable-next-line no-await-in-loop
		const isIgnored = await isGitIgnored({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative ignore - sync', t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/negative'))) {
		const isIgnored = isGitIgnoredSync({cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !isIgnored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/multiple-negation'))) {
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
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/multiple-negation'))) {
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

test('check file', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	const ignoredFile = path.join(directory, 'foo.js');
	const isIgnored = await isGitIgnored({cwd: directory});
	const isIgnoredSync = isGitIgnoredSync({cwd: directory});

	for (const file of getPathValues(ignoredFile)) {
		t.true(isIgnored(file));
		t.true(isIgnoredSync(file));
	}

	for (const file of getPathValues(path.join(directory, 'bar.js'))) {
		t.false(isIgnored(file));
	}
});
