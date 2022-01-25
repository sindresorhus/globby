import path from 'node:path';
import test from 'ava';
import slash from 'slash';
import {
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
		const isIgnored = await isGitIgnored({cwd});
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

test('custom ignore files - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');
	const files = [
		'ignored-by-eslint.js',
		'ignored-by-prettier.js',
		'not-ignored.js',
	];

	const isEslintIgnored = isIgnoredByIgnoreFilesSync('.eslintignore', {cwd});
	const isPrettierIgnored = isIgnoredByIgnoreFilesSync('.prettierignore', {cwd});
	const isEslintOrPrettierIgnored = isIgnoredByIgnoreFilesSync('.{prettier,eslint}ignore', {cwd});
	t.deepEqual(
		files.filter(file => isEslintIgnored(file)),
		[
			'ignored-by-eslint.js',
		],
	);
	t.deepEqual(
		files.filter(file => isPrettierIgnored(file)),
		[
			'ignored-by-prettier.js',
		],
	);
	t.deepEqual(
		files.filter(file => isEslintOrPrettierIgnored(file)),
		[
			'ignored-by-eslint.js',
			'ignored-by-prettier.js',
		],
	);
});

test('custom ignore files - async', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');
	const files = [
		'ignored-by-eslint.js',
		'ignored-by-prettier.js',
		'not-ignored.js',
	];

	const isEslintIgnored = await isIgnoredByIgnoreFiles('.eslintignore', {cwd});
	const isPrettierIgnored = await isIgnoredByIgnoreFiles('.prettierignore', {cwd});
	const isEslintOrPrettierIgnored = await isIgnoredByIgnoreFiles('.{prettier,eslint}ignore', {cwd});
	t.deepEqual(
		files.filter(file => isEslintIgnored(file)),
		[
			'ignored-by-eslint.js',
		],
	);
	t.deepEqual(
		files.filter(file => isPrettierIgnored(file)),
		[
			'ignored-by-prettier.js',
		],
	);
	t.deepEqual(
		files.filter(file => isEslintOrPrettierIgnored(file)),
		[
			'ignored-by-eslint.js',
			'ignored-by-prettier.js',
		],
	);
});
