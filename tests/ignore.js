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

const runIsIgnoredByIgnoreFiles = async (t, patterns, options, fn) => {
	const promisePredicate = await isIgnoredByIgnoreFiles(patterns, options);
	const syncPredicate = isIgnoredByIgnoreFilesSync(patterns, options);

	const promiseResult = fn(promisePredicate);
	const syncResult = fn(syncPredicate);

	t[Array.isArray(promiseResult) ? 'deepEqual' : 'is'](
		promiseResult,
		syncResult,
		'isIgnoredByIgnoreFilesSync() result is different than isIgnoredByIgnoreFiles()',
	);

	return promiseResult;
};

const runIsGitIgnored = async (t, options, fn) => {
	const promisePredicate = await isGitIgnored(options);
	const syncPredicate = isGitIgnoredSync(options);

	const promiseResult = fn(promisePredicate);
	const syncResult = fn(syncPredicate);

	t[Array.isArray(promiseResult) ? 'deepEqual' : 'is'](
		promiseResult,
		syncResult,
		'isGitIgnoredSync() result is different than isGitIgnored()',
	);

	return promiseResult;
};

test('ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/gitignore'))) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runIsGitIgnored(
			t,
			{cwd},
			isIgnored => ['foo.js', 'bar.js'].filter(file => !isIgnored(file)),
		);
		const expected = ['bar.js'];
		t.deepEqual(actual, expected);
	}
});

test('ignore - mixed path styles', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		t.true(
			// eslint-disable-next-line no-await-in-loop
			await runIsGitIgnored(
				t,
				{cwd},
				isIgnored => isIgnored(slash(path.resolve(directory, 'foo.js'))),
			),
		);
	}
});

test('ignore - os paths', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		t.true(
			// eslint-disable-next-line no-await-in-loop
			await runIsGitIgnored(
				t,
				{cwd},
				isIgnored => isIgnored(path.resolve(directory, 'foo.js')),
			),
		);
	}
});

test('negative ignore', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/negative'))) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runIsGitIgnored(
			t,
			{cwd},
			isIgnored => ['foo.js', 'bar.js'].filter(file => !isIgnored(file)),
		);
		const expected = ['foo.js'];
		t.deepEqual(actual, expected);
	}
});

test('multiple negation', async t => {
	for (const cwd of getPathValues(path.join(PROJECT_ROOT, 'fixtures/multiple-negation'))) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runIsGitIgnored(
			t,
			{cwd},
			isIgnored => [
				'!!!unicorn.js',
				'!!unicorn.js',
				'!unicorn.js',
				'unicorn.js',
			].filter(file => !isIgnored(file)),
		);

		const expected = ['!!unicorn.js', '!unicorn.js'];
		t.deepEqual(actual, expected);
	}
});

test('check file', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	for (const ignoredFile of getPathValues(path.join(directory, 'foo.js'))) {
		t.true(
			// eslint-disable-next-line no-await-in-loop
			await runIsGitIgnored(
				t,
				{cwd: directory},
				isIgnored => isIgnored(ignoredFile),
			),
		);
	}

	for (const notIgnoredFile of getPathValues(path.join(directory, 'bar.js'))) {
		t.false(
			// eslint-disable-next-line no-await-in-loop
			await runIsGitIgnored(
				t,
				{cwd: directory},
				isIgnored => isIgnored(notIgnoredFile),
			),
		);
	}
});

test('custom ignore files', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');
	const files = [
		'ignored-by-eslint.js',
		'ignored-by-prettier.js',
		'not-ignored.js',
	];

	t.deepEqual(
		await runIsIgnoredByIgnoreFiles(
			t,
			'.eslintignore',
			{cwd},
			isEslintIgnored => files.filter(file => isEslintIgnored(file)),
		),
		[
			'ignored-by-eslint.js',
		],
	);
	t.deepEqual(
		await runIsIgnoredByIgnoreFiles(
			t,
			'.prettierignore',
			{cwd},
			isPrettierIgnored => files.filter(file => isPrettierIgnored(file)),
		),
		[
			'ignored-by-prettier.js',
		],
	);
	t.deepEqual(
		await runIsIgnoredByIgnoreFiles(
			t,
			'.{prettier,eslint}ignore',
			{cwd},
			isEslintOrPrettierIgnored => files.filter(file => isEslintOrPrettierIgnored(file)),
		),
		[
			'ignored-by-eslint.js',
			'ignored-by-prettier.js',
		],
	);
});
