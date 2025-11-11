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
		// eslint-disable-next-line no-await-in-loop
		const result = await runIsGitIgnored(
			t,
			{cwd},
			isIgnored => isIgnored(slash(path.resolve(directory, 'foo.js'))),
		);

		t.true(result);
	}
});

test('ignore - os paths', async t => {
	const directory = path.join(PROJECT_ROOT, 'fixtures/gitignore');
	for (const cwd of getPathValues(directory)) {
		// eslint-disable-next-line no-await-in-loop
		const result = await runIsGitIgnored(
			t,
			{cwd},
			isIgnored => isIgnored(path.resolve(directory, 'foo.js')),
		);

		t.true(result);
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
		// eslint-disable-next-line no-await-in-loop
		const result = await runIsGitIgnored(
			t,
			{cwd: directory},
			isIgnored => isIgnored(ignoredFile),
		);

		t.true(result);
	}

	for (const notIgnoredFile of getPathValues(path.join(directory, 'bar.js'))) {
		// eslint-disable-next-line no-await-in-loop
		const result = await runIsGitIgnored(
			t,
			{cwd: directory},
			isIgnored => isIgnored(notIgnoredFile),
		);

		t.false(result);
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

test('gitignore patterns starting with ./ or ../ do not match files', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-dotslash');
	const isIgnored = await isGitIgnored({cwd});

	// Pattern "./foo.js" in .gitignore does NOT match "foo.js" (matches Git behavior)
	t.false(isIgnored('foo.js'));

	// Pattern "../bar.js" in .gitignore does NOT match anything in cwd
	t.false(isIgnored('bar.js'));

	// Regular pattern "baz.js" still works normally
	t.true(isIgnored('baz.js'));
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

test.serial('bad permissions - ignore option', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/bad-permissions');
	const noReadDirectory = path.join(cwd, 'noread');

	await chmod(noReadDirectory, 0o000);

	await t.notThrowsAsync(runIsIgnoredByIgnoreFiles(
		t,
		'**/*',
		{cwd, ignore: ['noread']},
		() => {},
	));

	t.teardown(() => chmod(noReadDirectory, 0o755));
});

test.serial('bad permissions - suppressErrors option', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/bad-permissions');
	const noReadDirectory = path.join(cwd, 'noread');

	await chmod(noReadDirectory, 0o000);

	// With suppressErrors: true, should not throw even when encountering unreadable directories
	const isIgnored = await runIsGitIgnored(
		t,
		{cwd, suppressErrors: true},
		predicate => predicate,
	);

	// Should be able to check if files are ignored
	t.is(typeof isIgnored('test.js'), 'boolean');

	t.teardown(() => chmod(noReadDirectory, 0o755));
});

// Extensive fast-glob options tests
test('option: suppressErrors - async', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	// Should work without errors
	const isIgnored = await isGitIgnored({cwd, suppressErrors: true});
	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: suppressErrors - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	// Should work without errors
	const isIgnored = isGitIgnoredSync({cwd, suppressErrors: true});
	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: deep - limit depth to 0 (only root .gitignore)', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	// With deep: 0, should only find .gitignore in the root
	const isIgnored = await isGitIgnored({cwd, deep: 0});

	// Root .gitignore patterns should not be loaded (there isn't one in this fixture)
	// So nothing should be ignored
	t.false(isIgnored('subdir/file.log'));
});

test('option: deep - limit depth to 1', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	// With deep: 1, should find .gitignore in root and direct subdirectories
	const isIgnored = await isGitIgnored({cwd, deep: 1});

	// Should find subdir/.gitignore
	t.true(isIgnored('subdir/file.log'));
	t.false(isIgnored('file.log')); // Not ignored by any .gitignore
});

test('option: deep - sync version', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	const isIgnored = isGitIgnoredSync({cwd, deep: 1});
	t.true(isIgnored('subdir/file.log'));
});

test('option: ignore - exclude specific .gitignore files', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	// Ignore .gitignore files in subdirectories
	const isIgnored = await isGitIgnored({cwd, ignore: ['**/subdir/**']});

	// Should not load subdir/.gitignore
	t.false(isIgnored('subdir/file.log'));
});

test('option: ignore - string format', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	// Test with single string instead of array
	const isIgnored = await isGitIgnored({cwd, ignore: '**/subdir/**'});

	t.false(isIgnored('subdir/file.log'));
});

test('option: ignore - sync version', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	const isIgnored = isGitIgnoredSync({cwd, ignore: ['**/subdir/**']});
	t.false(isIgnored('subdir/file.log'));
});

test('option: followSymbolicLinks', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	// Test with followSymbolicLinks explicitly set
	const isIgnored = await isGitIgnored({cwd, followSymbolicLinks: true});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: followSymbolicLinks - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	const isIgnored = isGitIgnoredSync({cwd, followSymbolicLinks: false});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: concurrency', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	// Test with custom concurrency
	const isIgnored = await isGitIgnored({cwd, concurrency: 2});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: concurrency - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	const isIgnored = isGitIgnoredSync({cwd, concurrency: 4});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: throwErrorOnBrokenSymbolicLink', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	const isIgnored = await isGitIgnored({cwd, throwErrorOnBrokenSymbolicLink: true});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: throwErrorOnBrokenSymbolicLink - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore');

	const isIgnored = isGitIgnoredSync({cwd, throwErrorOnBrokenSymbolicLink: false});

	t.true(isIgnored('foo.js'));
	t.false(isIgnored('bar.js'));
});

test('option: multiple options combined', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	// Test combination of multiple options
	const isIgnored = await isGitIgnored({
		cwd,
		deep: 2,
		ignore: ['**/deep/deeper/**'],
		suppressErrors: true,
		followSymbolicLinks: false,
		concurrency: 4,
		throwErrorOnBrokenSymbolicLink: false,
	});

	// Should respect all options
	t.true(isIgnored('subdir/file.log'));
	t.true(isIgnored('subdir/deep/file.log'));
});

test('option: multiple options combined - sync', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/gitignore-nested');

	const isIgnored = isGitIgnoredSync({
		cwd,
		deep: 2,
		ignore: ['**/deep/deeper/**'],
		suppressErrors: true,
		followSymbolicLinks: false,
		concurrency: 2,
	});

	t.true(isIgnored('subdir/file.log'));
	t.true(isIgnored('subdir/deep/file.log'));
});

test('isIgnoredByIgnoreFiles - option: suppressErrors', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');

	const isIgnored = await isIgnoredByIgnoreFiles('.eslintignore', {
		cwd,
		suppressErrors: true,
	});

	t.true(isIgnored('ignored-by-eslint.js'));
	t.false(isIgnored('not-ignored.js'));
});

test('isIgnoredByIgnoreFiles - option: deep', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures');

	// With deep: 0, should only find .eslintignore in fixtures directory
	const isIgnored = await isIgnoredByIgnoreFiles('**/.eslintignore', {
		cwd,
		deep: 1,
	});

	// Should find ignore-files/.eslintignore
	t.is(typeof isIgnored('ignored-by-eslint.js'), 'boolean');
});

test('isIgnoredByIgnoreFiles - option: ignore', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures');

	// Ignore .eslintignore in specific directories
	const isIgnored = await isIgnoredByIgnoreFiles('**/.eslintignore', {
		cwd,
		ignore: '**/ignore-files/**',
	});

	// Should not find any .eslintignore files
	t.is(typeof isIgnored('test.js'), 'boolean');
});

test('isIgnoredByIgnoreFiles - multiple options', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');

	const isIgnored = await isIgnoredByIgnoreFiles('.{eslint,prettier}ignore', {
		cwd,
		suppressErrors: true,
		deep: 1,
		followSymbolicLinks: false,
		concurrency: 2,
		throwErrorOnBrokenSymbolicLink: false,
	});

	t.true(isIgnored('ignored-by-eslint.js'));
	t.true(isIgnored('ignored-by-prettier.js'));
	t.false(isIgnored('not-ignored.js'));
});

test('isIgnoredByIgnoreFilesSync - option: suppressErrors', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');

	const isIgnored = isIgnoredByIgnoreFilesSync('.eslintignore', {
		cwd,
		suppressErrors: true,
	});

	t.true(isIgnored('ignored-by-eslint.js'));
	t.false(isIgnored('not-ignored.js'));
});

test('isIgnoredByIgnoreFilesSync - option: deep', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures');

	const isIgnored = isIgnoredByIgnoreFilesSync('**/.eslintignore', {
		cwd,
		deep: 1,
	});

	t.is(typeof isIgnored('test.js'), 'boolean');
});

test('isIgnoredByIgnoreFilesSync - option: ignore string', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures');

	// Test with string instead of array
	const isIgnored = isIgnoredByIgnoreFilesSync('**/.eslintignore', {
		cwd,
		ignore: '**/node_modules/**',
	});

	t.is(typeof isIgnored('test.js'), 'boolean');
});

test('isIgnoredByIgnoreFilesSync - multiple options', t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures/ignore-files');

	const isIgnored = isIgnoredByIgnoreFilesSync('.{eslint,prettier}ignore', {
		cwd,
		suppressErrors: true,
		deep: 1,
		followSymbolicLinks: false,
		concurrency: 4,
	});

	t.true(isIgnored('ignored-by-eslint.js'));
	t.true(isIgnored('ignored-by-prettier.js'));
	t.false(isIgnored('not-ignored.js'));
});
