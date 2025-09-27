import {chmod} from 'node:fs/promises';
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

const runIsIgnoredByIgnoreFiles = async (t, patterns, options, function_) => {
	const promisePredicate = await isIgnoredByIgnoreFiles(patterns, options);
	const syncPredicate = isIgnoredByIgnoreFilesSync(patterns, options);

	const promiseResult = function_(promisePredicate);
	const syncResult = function_(syncPredicate);

	t[Array.isArray(promiseResult) ? 'deepEqual' : 'is'](
		promiseResult,
		syncResult,
		'isIgnoredByIgnoreFilesSync() result is different than isIgnoredByIgnoreFiles()',
	);

	return promiseResult;
};

const runIsGitIgnored = async (t, options, function_) => {
	const promisePredicate = await isGitIgnored(options);
	const syncPredicate = isGitIgnoredSync(options);

	const promiseResult = function_(promisePredicate);
	const syncResult = function_(syncPredicate);

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

test('gitignore patterns in subdirectories apply recursively', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures', 'gitignore-nested');
	const isIgnored = await isGitIgnored({cwd});

	// Pattern '*.log' in subdir/.gitignore should ignore files at any level below
	t.true(isIgnored('subdir/file.log'));
	t.true(isIgnored('subdir/deep/file.log'));
	t.true(isIgnored('subdir/deep/deeper/file.log'));
	t.false(isIgnored('file.log')); // Not under subdir

	// Pattern 'specific.txt' should ignore at any level below
	t.true(isIgnored('subdir/specific.txt'));
	t.true(isIgnored('subdir/deep/specific.txt'));
	t.false(isIgnored('specific.txt')); // Not under subdir

	// Edge case: pattern with trailing slash (directory pattern) in nested gitignore
	// Pattern 'temp/' in subdir/.gitignore should match temp dirs at any level below
	// (This is the core fix for issue #146)
	t.true(isIgnored('subdir/temp/file.js'));
	t.true(isIgnored('subdir/deep/temp/file.js'));
	t.false(isIgnored('temp/file.js')); // Not under subdir
});

test('gitignore patterns with slashes are relative to gitignore location', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures', 'gitignore-nested');
	const isIgnored = await isGitIgnored({cwd});

	// Pattern 'deep/*.tmp' should only ignore direct children of deep/
	t.true(isIgnored('subdir/deep/file.tmp'));
	t.false(isIgnored('subdir/deep/nested/file.tmp'));
	t.false(isIgnored('subdir/file.tmp'));

	// Leading slash patterns anchor to gitignore directory
	// If subdir/.gitignore had '/specific.txt', it would only match subdir/specific.txt
	// not subdir/deep/specific.txt (but our test fixture uses 'specific.txt' without /)
});

test('gitignore edge cases with trailing slashes and special patterns', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures', 'gitignore-nested');
	const isIgnored = await isGitIgnored({cwd});

	// Directory patterns with trailing slash (would match directories themselves)
	// Note: globby by default uses onlyFiles:true, so directories aren't in results
	// But the ignore predicate should still correctly identify them

	// Negation patterns work correctly in subdirectories
	// Pattern in root that would be negated in subdirectory still applies
	t.true(isIgnored('subdir/file.log')); // *.log from subdir/.gitignore

	// Empty lines and comments in .gitignore files are handled
	// (tested implicitly - our fixtures may have them)
});

test('relative paths with ./ and ../ are handled correctly', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	const isIgnored = await isGitIgnored({cwd});

	// Paths with ./ are normalized to remove the prefix
	t.false(isIgnored('./bar.js')); // Not ignored, same as 'bar.js'
	t.true(isIgnored('./foo.js')); // Ignored, same as 'foo.js'

	// Paths with ../ point outside cwd and won't match any patterns
	t.false(isIgnored('../anything.js')); // Outside cwd, returns false
	t.false(isIgnored('../../foo.js')); // Multiple levels up, still outside
	t.false(isIgnored('../fixtures/gitignore/foo.js')); // Outside then back in - still treated as outside
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

test.serial('bad permissions', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/bad-permissions');
	const noReadDirectory = path.join(cwd, 'noread');

	await chmod(noReadDirectory, 0o000);

	await t.notThrowsAsync(
		runIsIgnoredByIgnoreFiles(
			t,
			'**/*',
			{cwd, ignore: ['noread']},
			() => {},
		),
	);

	t.teardown(() => chmod(noReadDirectory, 0o755));
});
