import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {
	globby,
	globbySync,
	isGitIgnored,
	isIgnoredByIgnoreFiles,
} from '../index.js';
import {convertIgnorePatternsForIgnoreFileSearch} from '../utilities.js';
import {
	createGlobalGitignoreConfig,
	createTemporaryGitRepository,
	runGlobby,
	setGitConfigGlobal,
} from './utilities.js';

// Forwarding `ignore` to the search that looks for the ignore files disabled the `gitignore` option outright. See https://github.com/sindresorhus/globby/issues/281
test('the `ignore` option does not hide the ignore files it globs for', async t => {
	for (const ignore of ['**/.gi*', '.gitignore', '**/.gitignore', '**/*ignore', '{**/.gitignore,dist}', '**/{.gitignore,foo}', '**/+(.gitignore)']) {
		const cwd = createTemporaryGitRepository();
		fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
		fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
		fs.writeFileSync(path.join(cwd, 'kept.js'), '');

		// eslint-disable-next-line no-await-in-loop
		const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore});
		t.deepEqual(result, ['kept.js'], `\`ignore: ${ignore}\` should not disable the \`gitignore\` option`);
	}
});

test('the `ignore` option does not hide nested ignore files', async t => {
	const cwd = createTemporaryGitRepository();
	fs.mkdirSync(path.join(cwd, 'nested'));
	fs.writeFileSync(path.join(cwd, 'nested/.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'nested/ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'nested/kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: '**/.gi*'});

	t.deepEqual(result, ['nested/kept.js']);
});

test('the `ignore` option does not hide the files found by `ignoreFiles`', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, ignoreFiles: '**/.eslintignore', ignore: '**/.eslint*'});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option does not hide files found by an extglob `ignoreFiles` pattern', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, ignoreFiles: '**/+(.eslintignore|.prettierignore)', ignore: '**/.eslintignore'});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option does not hide files found by an extglob spanning directories', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'foo'));
	fs.writeFileSync(path.join(cwd, 'foo/.eslintignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'foo/ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'foo/kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, ignoreFiles: '**/+(foo/.eslintignore|bar/.prettierignore)', ignore: '**/.eslintignore'});

	t.deepEqual(result, ['foo/kept.js']);
});

test('the `ignore` option does not hide an `ignoreFiles` path that has no wildcard', async t => {
	// A path without a wildcard is read without the recursive search, so it reaches the `ignore` option by a route of its own.
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, ignoreFiles: '.eslintignore', ignore: '**/.eslintignore'});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option still hides the ignore files from the results', async t => {
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	// `dot` is what makes the ignore file reachable by `**/*` in the first place, so this is the only way to see that it is the `ignore` option, and not the default, that leaves it out.
	const withoutIgnore = await runGlobby(t, '**/*', {cwd, gitignore: true, dot: true});
	const withIgnore = await runGlobby(t, '**/*', {
		cwd, gitignore: true, dot: true, ignore: '**/.gitignore',
	});

	t.deepEqual(withoutIgnore.sort(), ['.gitignore', 'kept.js']);
	t.deepEqual(withIgnore, ['kept.js']);
});

test('the `ignore` option does not hide the ignore files above the cwd', async t => {
	// Ignore files at or above the cwd are located without traversing, so they are matched by a search of their own.
	const repository = createTemporaryGitRepository();
	const cwd = path.join(repository, 'sub');
	fs.mkdirSync(cwd);
	fs.writeFileSync(path.join(repository, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: '**/.gitignore'});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option does not hide the ignore files of `gitignore` and `ignoreFiles` at once', async t => {
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'by-git.js\n');
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'by-eslint.js\n');
	fs.writeFileSync(path.join(cwd, 'by-git.js'), '');
	fs.writeFileSync(path.join(cwd, 'by-eslint.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {
		cwd,
		gitignore: true,
		ignoreFiles: '**/.eslintignore',
		ignore: '**/*ignore',
	});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option hides none of several `ignoreFiles` when it names one of them', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'by-eslint.js\n');
	fs.writeFileSync(path.join(cwd, '.prettierignore'), 'by-prettier.js\n');
	fs.writeFileSync(path.join(cwd, 'by-eslint.js'), '');
	fs.writeFileSync(path.join(cwd, 'by-prettier.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	// Naming either one has to protect both, so the last of the searched files counts as much as the first.
	for (const ignore of ['**/.eslint*', '**/.prettier*']) {
		// eslint-disable-next-line no-await-in-loop
		const result = await runGlobby(t, '**/*', {
			cwd,
			ignoreFiles: ['**/.eslintignore', '**/.prettierignore'],
			ignore,
		});
		t.deepEqual(result, ['kept.js'], `\`ignore: ${ignore}\` should hide neither ignore file from the search`);
	}
});

test('the `ignore` option leaves the negations in the ignore files intact', async t => {
	// Negations make the search run a second, unpruned pass, so they reach the ignore file search by a path of their own.
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, '.gitignore'), '*.log\n!important.log\n');
	fs.writeFileSync(path.join(cwd, 'noise.log'), '');
	fs.writeFileSync(path.join(cwd, 'important.log'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: '**/.gitignore'});

	t.deepEqual(result.sort(), ['important.log', 'kept.js']);
});

test('the `globalGitignore` option is out of reach of the `ignore` option', async t => {
	// The global ignore file is read from the Git config rather than globbed for, so no pattern can hide it.
	const {configFile} = createGlobalGitignoreConfig('ignored.js\n');
	setGitConfigGlobal(t, configFile);
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, globalGitignore: true, ignore: ['**/*ignore*', '**/.gitignore_global']});

	t.deepEqual(result, ['kept.js']);
});

test('the ignore file predicates keep excluding the ignore files their `ignore` option names', async t => {
	// The opposite of the `globby()` contract, and a documented one: there `ignore` says what to leave out of the results, here it says what to leave out of the search.
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'ignored.js\n');

	t.true((await isGitIgnored({cwd}))('ignored.js'));
	t.false((await isGitIgnored({cwd, ignore: ['**/.gitignore']}))('ignored.js'));

	t.true((await isIgnoredByIgnoreFiles('**/.eslintignore', {cwd}))('ignored.js'));
	t.false((await isIgnoredByIgnoreFiles('**/.eslintignore', {cwd, ignore: ['**/.eslintignore']}))('ignored.js'));
});

test('the `ignore` option may name a directory that holds an ignore file', async t => {
	// Skipping such a directory costs nothing: an ignore file only governs its own directory and below, and none of that reaches the results anyway.
	const cwd = createTemporaryGitRepository();
	fs.mkdirSync(path.join(cwd, 'vendor'));
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'root-ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'vendor/.gitignore'), 'vendor-ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'vendor/vendor-ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'vendor/vendor-kept.js'), '');
	fs.writeFileSync(path.join(cwd, 'root-ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: 'vendor'});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option does not hide ignore files at any depth', async t => {
	const cwd = createTemporaryGitRepository();
	fs.mkdirSync(path.join(cwd, 'a/b/c'), {recursive: true});
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'root-ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'a/.gitignore'), 'a-ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'a/b/c/.gitignore'), 'c-ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'root-ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');
	fs.writeFileSync(path.join(cwd, 'a/a-ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'a/kept.js'), '');
	fs.writeFileSync(path.join(cwd, 'a/b/c/c-ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'a/b/c/kept.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: '**/.gi*'});

	t.deepEqual(result.sort(), ['a/b/c/kept.js', 'a/kept.js', 'kept.js']);
});

test('the `ignore` option leaves the directory rules in the ignore files intact', async t => {
	// A directory rule is what the search turns into a prune pattern, so it is the rule most likely to be lost with the ignore file that declares it.
	const cwd = createTemporaryGitRepository();
	fs.mkdirSync(path.join(cwd, 'build'));
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'build/\n');
	fs.writeFileSync(path.join(cwd, 'build/bundle.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {
		cwd, gitignore: true, ignore: '**/.gitignore', onlyFiles: false,
	});

	t.deepEqual(result, ['kept.js']);
});

test('an absolute `ignore` pattern does not hide the ignore file it names', async t => {
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const ignore = path.join(cwd, '.gitignore').split(path.sep).join('/');
	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore});

	t.deepEqual(result, ['kept.js']);
});

test('the `ignore` option is harmless when there is no ignore file to find', async t => {
	const cwd = createTemporaryGitRepository();
	fs.writeFileSync(path.join(cwd, 'a.js'), '');
	fs.writeFileSync(path.join(cwd, 'b.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignore: '**/.gitignore'});

	t.deepEqual(result.sort(), ['a.js', 'b.js']);
});

// A custom `fs` is the only way to make a directory unreadable here: `@nodelib/fs.scandir` reads `fs.readdir` when it is imported, so patching the module afterwards has no effect on fast-glob.
const createUnreadableDirectoryFs = unreadableDirectory => {
	const isUnreadable = directoryPath => path.resolve(String(directoryPath)) === path.resolve(unreadableDirectory);
	const createError = () => Object.assign(new Error('Permission denied'), {code: 'EACCES'});

	return {
		...fs,
		readdir(directoryPath, options, callback) {
			if (isUnreadable(directoryPath)) {
				queueMicrotask(() => callback(createError()));
				return;
			}

			// eslint-disable-next-line n/prefer-promises/fs -- fast-glob calls the callback style.
			fs.readdir(directoryPath, options, callback);
		},
		readdirSync(directoryPath, options) {
			if (isUnreadable(directoryPath)) {
				throw createError();
			}

			return fs.readdirSync(directoryPath, options);
		},
	};
};

// Records every directory read, so a test can show that a directory was never walked rather than only that walking it would have failed.
const createRecordingFs = visitedDirectories => ({
	...fs,
	readdir(directoryPath, options, callback) {
		visitedDirectories.push(path.resolve(String(directoryPath)));
		// eslint-disable-next-line n/prefer-promises/fs -- fast-glob calls the callback style.
		fs.readdir(directoryPath, options, callback);
	},
	readdirSync(directoryPath, options) {
		visitedDirectories.push(path.resolve(String(directoryPath)));
		return fs.readdirSync(directoryPath, options);
	},
});

test('the `ignore` option still prunes the ignore file search', async t => {
	const cwd = createTemporaryGitRepository();
	fs.mkdirSync(path.join(cwd, 'vendor/deep'), {recursive: true});
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'vendor/deep/vendored.js'), '');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const visitedDirectories = [];
	const result = await runGlobby(t, '**/*', {
		cwd,
		gitignore: true,
		ignore: ['**/.gitignore', 'vendor'],
		fs: createRecordingFs(visitedDirectories),
	});

	// The dropped pattern must not cost the kept one its effect, in either of the two searches or in the glob itself.
	t.deepEqual(result, ['kept.js']);
	t.false(
		visitedDirectories.some(directory => directory.startsWith(path.join(cwd, 'vendor'))),
		'`vendor` should never be read, by the ignore file search or by the glob',
	);
	t.true(visitedDirectories.includes(path.resolve(cwd)), 'the recording `fs` should have been used at all');
});

test('the `ignore` option still keeps the ignore file search out of excluded directories', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'unreadable/inner'), {recursive: true});
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'unreadable/inner/file.js'), '');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const fsImplementation = createUnreadableDirectoryFs(path.join(cwd, 'unreadable'));

	// Without the exclusion the search walks into the unreadable directory, which is what the forwarding is for. See https://github.com/sindresorhus/globby/pull/259
	await t.throwsAsync(globby('**/*', {cwd, gitignore: true, fs: fsImplementation}), {code: 'EACCES'});
	t.throws(() => globbySync('**/*', {cwd, gitignore: true, fs: fsImplementation}), {code: 'EACCES'});

	// The last one also shows that only the pattern that could name the ignore file is dropped; the other still skips the directory.
	for (const ignore of ['unreadable', 'unreadable/**', ['**/.gitignore', 'unreadable']]) {
		// eslint-disable-next-line no-await-in-loop
		const result = await runGlobby(t, '**/*', {
			cwd,
			gitignore: true,
			ignore,
			fs: fsImplementation,
		});
		t.deepEqual(result, ['kept.js'], `\`ignore: ${ignore}\` should skip the unreadable directory`);
	}
});

test('an extglob `ignoreFiles` pattern keeps unrelated directories excluded', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'unreadable'));
	fs.writeFileSync(path.join(cwd, '.eslintignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	const result = await runGlobby(t, '**/*', {
		cwd,
		ignoreFiles: '**/+(.eslintignore|.prettierignore)',
		ignore: ['**/.eslintignore', 'unreadable'],
		fs: createUnreadableDirectoryFs(path.join(cwd, 'unreadable')),
	});

	t.deepEqual(result, ['kept.js']);
});

test('`suppressErrors` still covers what the dropped `ignore` patterns no longer skip', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'unreadable'), {recursive: true});
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored.js\n');
	fs.writeFileSync(path.join(cwd, 'ignored.js'), '');
	fs.writeFileSync(path.join(cwd, 'kept.js'), '');

	// `**/.gitignore` is dropped, so the search walks into the unreadable directory again. That is the documented way out.
	const result = await runGlobby(t, '**/*', {
		cwd,
		gitignore: true,
		ignore: '**/.gitignore',
		fs: createUnreadableDirectoryFs(path.join(cwd, 'unreadable')),
		suppressErrors: true,
	});

	t.deepEqual(result, ['kept.js']);
});

test('convertIgnorePatternsForIgnoreFileSearch drops only the patterns that could name an ignore file', t => {
	const searchPatterns = ['**/.gitignore'];
	const convert = ignorePatterns => convertIgnorePatternsForIgnoreFileSearch(ignorePatterns, searchPatterns);

	// Patterns that name a directory are kept, so that directory is still skipped while searching.
	t.deepEqual(convert(['testdir']), ['testdir']);
	t.deepEqual(convert(['testdir/']), ['testdir/']);
	t.deepEqual(convert(['**/dist']), ['**/dist']);
	t.deepEqual(convert(['../build']), ['../build']);
	t.deepEqual(convert(['**/node_modules/**']), ['**/node_modules/**']);
	t.deepEqual(convert(['**/*.tmp']), ['**/*.tmp']);

	// Patterns that could name the ignore file itself are dropped, wherever the name sits and whatever trails it.
	t.deepEqual(convert(['.gitignore']), []);
	t.deepEqual(convert(['**/.gitignore']), []);
	t.deepEqual(convert(['**/.gi*']), []);
	t.deepEqual(convert(['src/*']), []);
	t.deepEqual(convert(['**']), []);
	t.deepEqual(convert(['/']), []);
	t.deepEqual(convert(['a/b/.gitignore']), []);
	t.deepEqual(convert(['**/.gitignore/']), []);
	t.deepEqual(convert(['**/.gitignore/**']), []);
	t.deepEqual(convert(['dist/**/*']), []);
	t.deepEqual(convert(['a/b/dist']), ['a/b/dist']);

	// The comparison ignores case, which is what `caseSensitiveMatch: false` needs and costs nothing otherwise.
	t.deepEqual(convert(['**/.GITIGNORE']), []);

	// Extglobs are micromatch syntax the name comparison cannot read, so they are dropped on sight.
	t.deepEqual(convert(['**/+(.gitignore)']), []);
	t.deepEqual(convert(['**/!(dist)']), []);

	// Only the unsafe patterns are dropped; the rest of the array is untouched.
	t.deepEqual(convert(['**/.gitignore', 'dist', '**/.gi*', '**/node_modules/**']), ['dist', '**/node_modules/**']);

	// Brace groups are expanded before matching, so every alternative counts, on both sides.
	t.deepEqual(convert(['{**/.gitignore,dist}']), []);
	t.deepEqual(convert(['**/{.gitignore,foo}']), []);
	t.deepEqual(convert(['{dist,build}/**']), ['{dist,build}/**']);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslintignore'], ['.{eslint,prettier}ignore']), []);

	// Every searched ignore file counts, not just the first one.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.git*'], ['**/.gitignore', '**/.eslintignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslint*'], ['**/.gitignore', '**/.eslintignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/dist'], ['**/.gitignore', '**/.eslintignore']), ['**/dist']);

	// Only the ignore files that are actually searched for matter.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gi*'], ['**/.eslintignore']), ['**/.gi*']);
});

test('convertIgnorePatternsForIgnoreFileSearch reads the shape of the search patterns', t => {
	// Nothing to filter, and nothing to protect.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch([], ['**/.gitignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gitignore', 'dist'], []), ['**/.gitignore', 'dist']);

	// A search pattern can name the ignore file with a wildcard of its own, as `ignoreFiles` allows.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslintignore'], ['**/.*ignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gi*'], ['**/.*ignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/dist'], ['**/.*ignore']), ['**/dist']);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslintignore', 'unreadable'], ['**/+(.eslintignore|.prettierignore)']), ['unreadable']);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslintignore', 'unreadable'], ['**/+(foo/.eslintignore|bar/.prettierignore)']), []);

	// Only the name at the end of a search pattern is compared, so where it looks makes no difference.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gitignore'], ['/outside/the/cwd/.gitignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/dist'], ['/outside/the/cwd/.gitignore']), ['**/dist']);

	// One search pattern can name several ignore files, and a negated one still says which name to protect.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gitignore'], ['.{git,eslint}ignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.eslintignore'], ['.{git,eslint}ignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/dist'], ['.{git,eslint}ignore']), ['**/dist']);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/.gitignore'], ['!**/.gitignore']), []);
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['**/dist'], ['!**/.gitignore']), ['**/dist']);
});

test('convertIgnorePatternsForIgnoreFileSearch reads where the pattern points', t => {
	const convert = ignorePatterns => convertIgnorePatternsForIgnoreFileSearch(ignorePatterns, ['**/.gitignore']);

	// A prefix says where to look, never what to name, so it changes nothing on its own.
	t.deepEqual(convert(['./.gitignore']), []);
	t.deepEqual(convert(['../.gitignore']), []);
	t.deepEqual(convert(['/abs/path/.gitignore']), []);
	t.deepEqual(convert(['./dist']), ['./dist']);
	t.deepEqual(convert(['/abs/path/dist']), ['/abs/path/dist']);

	// A name the ignore file is only a prefix of is still a possible match, since the rest can be a wildcard.
	t.deepEqual(convert(['**/.gitignore*']), []);

	// Brace ranges expand like brace groups, and neither is a reason on its own to drop a pattern.
	t.deepEqual(convert(['.gitignore{1..2}']), ['.gitignore{1..2}']);
	t.deepEqual(convert(['{a..c}/dist']), ['{a..c}/dist']);
	t.deepEqual(convert(['{**/{.gitignore,x},dist}']), []);

	// Syntax the comparison cannot read is treated as a possible match rather than guessed at.
	t.deepEqual(convert([String.raw`**/\{a,.gitignore\}`]), []);
	t.deepEqual(convert(['']), []);
});

test('convertIgnorePatternsForIgnoreFileSearch leaves its input alone', t => {
	const searchPatterns = ['**/.gitignore'];
	const ignorePatterns = ['**/.gitignore', 'dist', '**/node_modules/**'];
	const result = convertIgnorePatternsForIgnoreFileSearch(ignorePatterns, searchPatterns);

	t.deepEqual(ignorePatterns, ['**/.gitignore', 'dist', '**/node_modules/**'], 'the input array must not be modified');
	t.deepEqual(result, ['dist', '**/node_modules/**']);

	// Nothing that survives one pass can be dropped by the next, so the ignore file search sees a stable list however often this runs.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(result, searchPatterns), result);

	// Duplicates are none of this function's business; dropping them would change what fast-glob is given.
	t.deepEqual(convertIgnorePatternsForIgnoreFileSearch(['dist', 'dist'], searchPatterns), ['dist', 'dist']);
});
