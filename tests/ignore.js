import path from 'node:path';
import test from 'ava';
import slash from 'slash';
import {isIgnored, isIgnoredSync} from '../ignore.js';
import {
	PROJECT_ROOT,
	getPathValues,
} from './utilities.js';

const gitignorePattern = '**/.gitignore';

test('ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/gitignore'))) {
		// eslint-disable-next-line no-await-in-loop
		const ignored = await isIgnored(gitignorePattern, {cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !ignored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('ignore - mixed path styles', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const ignored = await isIgnored(gitignorePattern, {cwd});
		t.true(ignored(slash(path.resolve(directory, 'foo.js'))));
	}
});

test('ignore - os paths', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const ignored = await isIgnored(gitignorePattern, {cwd});
		t.true(ignored(path.resolve(directory, 'foo.js')));
	}
});

test('ignore - sync', t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/gitignore'))) {
		const ignored = isIgnoredSync(gitignorePattern, {cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !ignored(file));
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/negative'))) {
		// eslint-disable-next-line no-await-in-loop
		const ignored = await isIgnored(gitignorePattern, {cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !ignored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('negative ignore - sync', t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/negative'))) {
		const ignored = isIgnoredSync(gitignorePattern, {cwd});
		const actual = ['foo.js', 'bar.js'].filter(file => !ignored(file));
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/multiple-negation'))) {
		// eslint-disable-next-line no-await-in-loop
		const ignored = await isIgnored(gitignorePattern, {cwd});

		const actual = [
			'!!!unicorn.js',
			'!!unicorn.js',
			'!unicorn.js',
			'unicorn.js',
		].filter(file => !ignored(file));

		const expected = ['!!unicorn.js', '!unicorn.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation - sync', t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/multiple-negation'))) {
		const ignored = isIgnoredSync(gitignorePattern, {cwd});

		const actual = [
			'!!!unicorn.js',
			'!!unicorn.js',
			'!unicorn.js',
			'unicorn.js',
		].filter(file => !ignored(file));

		const expected = ['!!unicorn.js', '!unicorn.js'];
		t.deepEqual(actual, expected);
	}
});

test('check file', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	const ignoredFile = path.join(directory, 'foo.js');
	const ignored = await isIgnored(gitignorePattern, {cwd: directory});
	const ignoredSync = isIgnoredSync(gitignorePattern, {cwd: directory});

	for (const file of getPathValues(ignoredFile)) {
		t.true(ignored(file));
		t.true(ignoredSync(file));
	}

	for (const file of getPathValues(path.join(directory, 'bar.js'))) {
		t.false(ignored(file));
	}
});
