import {Buffer} from 'node:buffer';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {format} from 'node:util';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {
	globby,
	globbySync,
	globbyStream,
	isDynamicPattern,
} from '../index.js';
import {
	normalizeDirectoryPatternForFastGlob,
	normalizeAbsolutePatternToRelative,
	getStaticAbsolutePathPrefix,
	normalizeNegativePattern,
} from '../utilities.js';
import {
	PROJECT_ROOT,
	createContextAwareFs,
	createTemporaryGitRepository,
	getPathValues,
	invalidPatterns,
	isUnique,
} from './utilities.js';

const cwd = process.cwd();
const temporary = 'tmp';

const cwdDirectoryError = {message: /The `cwd` option must be a path to a directory, got:/};

const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp',
];

const stabilizeResult = result => result
	.map(fastGlobResult => {
		// In `objectMode`, `fastGlobResult.dirent` contains a function that makes `t.deepEqual` assertion fail.
		// `fastGlobResult.stats` contains different `atime`.
		if (typeof fastGlobResult === 'object') {
			const {dirent, stats, ...rest} = fastGlobResult;
			return rest;
		}

		return fastGlobResult;
	})
	.sort((a, b) => (a.path ?? a).localeCompare(b.path ?? b));

const runGlobby = async (t, patterns, options) => {
	const syncResult = globbySync(patterns, options);
	const promiseResult = await globby(patterns, options);
	const streamResult = await globbyStream(patterns, options).toArray();

	const result = stabilizeResult(promiseResult);
	t.deepEqual(
		stabilizeResult(syncResult),
		result,
		'globbySync() result is different than globby()',
	);
	t.deepEqual(
		stabilizeResult(streamResult),
		result,
		'globbyStream() result is different than globby()',
	);

	return promiseResult;
};

const blockNodeModulesTraversal = directory => {
	const normalizedDirectory = path.normalize(directory);
	const directoryPrefix = `${normalizedDirectory}${path.sep}`;
	const fsPromises = fs.promises;
	const originalReaddir = fs.readdir;
	const originalReaddirSync = fs.readdirSync;
	const originalReaddirPromise = fsPromises.readdir;
	const originalOpendir = fs.opendir;
	const originalOpendirSync = fs.opendirSync;
	const originalOpendirPromise = fsPromises.opendir;

	const toStringPath = value => {
		if (typeof value === 'string') {
			return value;
		}

		if (value instanceof Buffer) {
			return value.toString();
		}

		return value ? String(value) : '';
	};

	const normalizeCandidate = value => {
		const stringPath = toStringPath(value);
		if (!stringPath) {
			return stringPath;
		}

		const absolutePath = path.isAbsolute(stringPath)
			? stringPath
			: path.join(directory, stringPath);
		return path.normalize(absolutePath);
	};

	const shouldBlock = value => {
		if (!value) {
			return false;
		}

		const normalizedPath = normalizeCandidate(value);
		if (!normalizedPath || !normalizedPath.startsWith(directoryPrefix)) {
			return false;
		}

		return normalizedPath.split(path.sep).includes('node_modules');
	};

	const createPermissionError = value => {
		const error = new Error('Blocked node_modules traversal');
		error.code = 'EACCES';
		error.path = toStringPath(value);
		return error;
	};

	const wrapCallbackStyle = original => (...args) => {
		let pathValue;
		let options;
		let callback;

		if (args.length === 2) {
			[pathValue, callback] = args;
			options = undefined;
		} else {
			[pathValue, options, callback] = args;
		}

		if (typeof options === 'function') {
			callback = options;
			options = undefined;
		}

		if (shouldBlock(pathValue)) {
			const error = createPermissionError(pathValue);
			queueMicrotask(() => callback(error));
			return;
		}

		const callArguments = options === undefined ? [pathValue, callback] : [pathValue, options, callback];
		return original.apply(fs, callArguments);
	};

	const wrapSync = original => (pathValue, options) => {
		if (shouldBlock(pathValue)) {
			throw createPermissionError(pathValue);
		}

		return options === undefined
			? original.call(fs, pathValue)
			: original.call(fs, pathValue, options);
	};

	const wrapPromise = original => async (pathValue, options) => {
		if (shouldBlock(pathValue)) {
			throw createPermissionError(pathValue);
		}

		return options === undefined
			? original.call(fsPromises, pathValue)
			: original.call(fsPromises, pathValue, options);
	};

	fs.readdir = wrapCallbackStyle(originalReaddir);
	fs.readdirSync = wrapSync(originalReaddirSync);
	fsPromises.readdir = wrapPromise(originalReaddirPromise);
	fs.opendir = wrapCallbackStyle(originalOpendir);
	fs.opendirSync = wrapSync(originalOpendirSync);
	fsPromises.opendir = wrapPromise(originalOpendirPromise);

	return () => {
		fs.readdir = originalReaddir;
		fs.readdirSync = originalReaddirSync;
		fsPromises.readdir = originalReaddirPromise;
		fs.opendir = originalOpendir;
		fs.opendirSync = originalOpendirSync;
		fsPromises.opendir = originalOpendirPromise;
	};
};

test.before(() => {
	if (!fs.existsSync(temporary)) {
		fs.mkdirSync(temporary);
	}

	for (const element of fixture) {
		fs.writeFileSync(element, '');
		fs.writeFileSync(path.join(PROJECT_ROOT, temporary, element), '');
	}
});

test.after(() => {
	for (const element of fixture) {
		fs.unlinkSync(element);
		fs.unlinkSync(path.join(PROJECT_ROOT, temporary, element));
	}

	fs.rmdirSync(temporary);
});

test('normalizeDirectoryPatternForFastGlob handles recursive directory patterns', t => {
	t.is(normalizeDirectoryPatternForFastGlob('node_modules/'), '**/node_modules/**');
	t.is(normalizeDirectoryPatternForFastGlob('build/'), '**/build/**');
	t.is(normalizeDirectoryPatternForFastGlob('/dist/'), '/dist/**');
	t.is(normalizeDirectoryPatternForFastGlob('src/cache/'), 'src/cache/**');
	t.is(normalizeDirectoryPatternForFastGlob('packages/**/cache/'), 'packages/**/cache/**');
	t.is(normalizeDirectoryPatternForFastGlob('keep.log'), 'keep.log');
	t.is(normalizeDirectoryPatternForFastGlob('**/'), '**/**', '**/ should normalize to **/** not **/**/**');
	t.is(normalizeDirectoryPatternForFastGlob('/'), '/**', '/ should normalize to /**');
	t.is(normalizeDirectoryPatternForFastGlob(''), '', 'empty string should remain empty');
});

test('normalizeAbsolutePatternToRelative strips leading slash for anchored globs', t => {
	// Single-segment patterns are normalized (root-anchored globs)
	t.is(normalizeAbsolutePatternToRelative('/**'), '**');
	t.is(normalizeAbsolutePatternToRelative('/foo'), 'foo');
	t.is(normalizeAbsolutePatternToRelative('/*.txt'), '*.txt');

	// Multi-segment patterns with glob in first segment are normalized
	t.is(normalizeAbsolutePatternToRelative('/{src,dist}/**'), '{src,dist}/**');
	t.is(normalizeAbsolutePatternToRelative('/@(src|dist)/**'), '@(src|dist)/**');
	t.is(normalizeAbsolutePatternToRelative('/*/foo'), '*/foo');

	// Multi-segment patterns with non-glob first segment are real absolute paths - preserved
	t.is(normalizeAbsolutePatternToRelative('/foo/**'), '/foo/**');
	t.is(normalizeAbsolutePatternToRelative('/Users/foo/bar'), '/Users/foo/bar');
	t.is(normalizeAbsolutePatternToRelative('/home/user/project/_*'), '/home/user/project/_*');

	// Non-absolute patterns are unchanged
	t.is(normalizeAbsolutePatternToRelative('foo'), 'foo', 'relative patterns unchanged');
	t.is(normalizeAbsolutePatternToRelative('**'), '**', 'globstar unchanged');
	t.is(normalizeAbsolutePatternToRelative(''), '', 'empty string unchanged');
});

test('getStaticAbsolutePathPrefix returns leading static absolute segments', t => {
	t.is(getStaticAbsolutePathPrefix('/tmp/project/**/*.js'), '/tmp/project');
	t.is(getStaticAbsolutePathPrefix('/tmp*/project/**/*.js'), undefined, 'glob in first segment');
	t.is(getStaticAbsolutePathPrefix('relative/**/*.js'), undefined, 'relative pattern');
	t.is(getStaticAbsolutePathPrefix('/tmp'), '/tmp', 'single static segment');
	t.is(getStaticAbsolutePathPrefix('/'), undefined, 'root only');
	t.is(getStaticAbsolutePathPrefix('/tmp/project'), '/tmp/project', 'fully static path');
});

test('normalizeNegativePattern handles root-anchored and absolute filesystem patterns', t => {
	// Dynamic root-anchored: normalized to relative
	t.is(normalizeNegativePattern('/**'), '**');
	t.is(normalizeNegativePattern('/{src,dist}/**'), '{src,dist}/**');

	// Single-segment literal: treated as root-anchored (no real filesystem path has just one segment)
	t.is(normalizeNegativePattern('/src'), 'src');

	// Multi-segment literal without matching positive prefix: strip to cwd-relative
	t.is(normalizeNegativePattern('/src/**'), 'src/**');
	t.is(normalizeNegativePattern('/tmp/project/_*', ['/Users/someone']), 'tmp/project/_*');

	// Multi-segment literal with matching positive prefix: preserve as absolute
	t.is(normalizeNegativePattern('/tmp/project/_*', ['/tmp/project']), '/tmp/project/_*');

	// Mixed positive pattern styles should keep root-anchored literals cwd-relative.
	t.is(normalizeNegativePattern('/tmp/project/_*', ['/tmp/project'], true), 'tmp/project/_*');

	// Ancestor positive prefixes should not force absolute behavior.
	t.is(normalizeNegativePattern('/tmp/project/src/**', ['/tmp/project']), 'tmp/project/src/**', 'ancestor positive prefixes should not force absolute negations');

	// Non-absolute: pass through unchanged
	t.is(normalizeNegativePattern('foo/bar'), 'foo/bar');
	t.is(normalizeNegativePattern('**'), '**');
});

test('glob', async t => {
	const result = await runGlobby(t, '*.tmp');
	t.deepEqual(result.sort(), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - multiple file paths', async t => {
	t.deepEqual(await runGlobby(t, ['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob - empty patterns', async t => {
	t.deepEqual(await runGlobby(t, []), []);
});

test('glob with multiple patterns', async t => {
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order', async t => {
	t.deepEqual(await runGlobby(t, ['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('negation-only patterns match all files in cwd except negated ones', async t => {
	// When using negation-only patterns in a scoped directory, it should match all files except the negated ones
	t.deepEqual(await runGlobby(t, ['!a.tmp', '!b.tmp'], {cwd: temporary}), ['c.tmp', 'd.tmp', 'e.tmp']);
});

test('single negation-only pattern in scoped directory', async t => {
	const result = await runGlobby(t, '!a.tmp', {cwd: temporary});
	t.deepEqual(result, ['b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('negation-only with brace expansion in scoped directory', async t => {
	const result = await runGlobby(t, '!{a,b}.tmp', {cwd: temporary});
	t.deepEqual(result, ['c.tmp', 'd.tmp', 'e.tmp']);
});

test('negation pattern with absolute path is normalized to relative', async t => {
	// !/** should exclude everything (cross-platform consistent behavior)
	// On Unix, /** is normally an absolute path from filesystem root
	// We normalize it to ** so it works the same on all platforms
	const result = await runGlobby(t, '!/**', {cwd: temporary});
	t.deepEqual(result, []);
});

test('negation with absolute filesystem paths (issue #275)', async t => {
	const temporaryCwd = temporaryDirectory();

	fs.writeFileSync(path.join(temporaryCwd, 'app.scss'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, '_partial.scss'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'b.scss'), '', 'utf8');

	try {
		// Single absolute negation
		const result = await runGlobby(t, [
			`${temporaryCwd}/*.scss`,
			`!${temporaryCwd}/_*`,
		]);

		t.deepEqual(result.map(filePath => path.basename(filePath)).sort(), ['app.scss', 'b.scss']);

		// Multiple absolute negations
		const result2 = await runGlobby(t, [
			`${temporaryCwd}/*.scss`,
			`!${temporaryCwd}/_*`,
			`!${temporaryCwd}/b*`,
		]);

		t.deepEqual(result2.map(filePath => path.basename(filePath)), ['app.scss']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('negation-only root-anchored extglob excludes directories from cwd root', async t => {
	const temporaryCwd = temporaryDirectory();

	fs.mkdirSync(path.join(temporaryCwd, 'src'), {recursive: true});
	fs.mkdirSync(path.join(temporaryCwd, 'dist'), {recursive: true});
	fs.mkdirSync(path.join(temporaryCwd, 'other'), {recursive: true});

	fs.writeFileSync(path.join(temporaryCwd, 'src', 'a.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'dist', 'b.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'other', 'c.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, ['!/@(src|dist)/**'], {cwd: temporaryCwd});
		t.deepEqual(result, ['other/c.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('negation-only root-anchored literal excludes directories from cwd root', async t => {
	const temporaryCwd = temporaryDirectory();

	fs.mkdirSync(path.join(temporaryCwd, 'src'), {recursive: true});
	fs.mkdirSync(path.join(temporaryCwd, 'other'), {recursive: true});

	fs.writeFileSync(path.join(temporaryCwd, 'src', 'a.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'other', 'c.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, ['!/src/**'], {cwd: temporaryCwd});
		t.deepEqual(result, ['other/c.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation works with mixed relative and absolute positives', async t => {
	const temporaryCwd = temporaryDirectory();

	fs.mkdirSync(path.join(temporaryCwd, 'src'), {recursive: true});
	fs.mkdirSync(path.join(temporaryCwd, 'other'), {recursive: true});

	fs.writeFileSync(path.join(temporaryCwd, 'src', 'a.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'other', 'c.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'src/**/*.js',
			`${temporaryCwd}/other/**/*.js`,
			'!/src/**',
		], {cwd: temporaryCwd});

		t.deepEqual(result.map(filePath => path.basename(filePath)).sort(), ['c.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation stays cwd-relative when absolute positive has unknown prefix', async t => {
	const temporaryCwd = temporaryDirectory();

	fs.mkdirSync(path.join(temporaryCwd, 'src'), {recursive: true});
	fs.writeFileSync(path.join(temporaryCwd, 'src', 'a.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'src/**/*.js',
			'/tmp*/nomatch/**/*.js',
			'!/src/**',
		], {cwd: temporaryCwd});

		t.deepEqual(result, []);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation does not depend on later absolute positive patterns', async t => {
	const temporaryCwd = temporaryDirectory();
	const rootSegment = temporaryCwd.split('/').find(Boolean);
	const rootAnchoredPattern = `!/${rootSegment}/**`;

	fs.mkdirSync(path.join(temporaryCwd, 'other'), {recursive: true});
	fs.writeFileSync(path.join(temporaryCwd, 'z.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'other', 'c.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'**/*.js',
			rootAnchoredPattern,
			`${temporaryCwd}/other/**/*.js`,
		], {cwd: temporaryCwd});

		t.true(result.map(filePath => path.basename(filePath)).includes('z.js'));
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation stays cwd-relative with ancestor absolute positive', async t => {
	const temporaryCwd = temporaryDirectory();
	if (path.sep === '\\') {
		t.pass();
		return;
	}

	const rootSegment = temporaryCwd.split('/').find(Boolean);
	const rootAnchoredPattern = `!/${rootSegment}/**`;

	fs.mkdirSync(path.join(temporaryCwd, 'src'), {recursive: true});
	fs.mkdirSync(path.join(temporaryCwd, 'other'), {recursive: true});
	fs.writeFileSync(path.join(temporaryCwd, 'src', 'a.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'other', 'c.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'src/**/*.js',
			`${temporaryCwd}/other/**/*.js`,
			rootAnchoredPattern,
		], {cwd: temporaryCwd});

		t.deepEqual(result.map(filePath => path.basename(filePath)).sort(), ['a.js', 'c.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation stays cwd-relative with mixed absolute and relative positives', async t => {
	const temporaryCwd = temporaryDirectory();
	if (path.sep === '\\') {
		t.pass();
		return;
	}

	fs.mkdirSync(path.join(temporaryCwd, 'tmp', 'project'), {recursive: true});
	fs.writeFileSync(path.join(temporaryCwd, 'tmp', 'project', '_partial.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'tmp', 'project', 'app.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'tmp/project/**/*.js',
			`${temporaryCwd}/**/*.nomatch`,
			'!/tmp/project/_*',
		], {cwd: temporaryCwd});

		t.deepEqual(result, ['tmp/project/app.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('root-anchored literal negation stays cwd-relative when absolute positive shares exact prefix', async t => {
	const temporaryCwd = temporaryDirectory();
	if (path.sep === '\\') {
		t.pass();
		return;
	}

	fs.mkdirSync(path.join(temporaryCwd, 'tmp', 'project'), {recursive: true});
	fs.writeFileSync(path.join(temporaryCwd, 'tmp', 'project', '_partial.js'), '', 'utf8');
	fs.writeFileSync(path.join(temporaryCwd, 'tmp', 'project', 'app.js'), '', 'utf8');

	try {
		const result = await runGlobby(t, [
			'tmp/project/**/*.js',
			'/tmp/project/**/*.nomatch',
			'!/tmp/project/_*',
		], {cwd: temporaryCwd});

		t.deepEqual(result, ['tmp/project/app.js']);
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('expandNegationOnlyPatterns: false returns empty array for negation-only patterns', async t => {
	const result = await runGlobby(t, ['!a.tmp', '!b.tmp'], {cwd: temporary, expandNegationOnlyPatterns: false});
	t.deepEqual(result, []);
});

test('expandNegationOnlyPatterns: false with single negation pattern returns empty array', async t => {
	const result = await runGlobby(t, '!a.tmp', {cwd: temporary, expandNegationOnlyPatterns: false});
	t.deepEqual(result, []);
});

test('expandNegationOnlyPatterns: false does not affect mixed patterns', async t => {
	// When there are positive patterns, negation-only expansion is not triggered
	const result = await runGlobby(t, ['*.tmp', '!a.tmp', '!b.tmp'], {cwd: temporary, expandNegationOnlyPatterns: false});
	t.deepEqual(result, ['c.tmp', 'd.tmp', 'e.tmp']);
});

test('expandNegationOnlyPatterns: true (default) works with negation-only patterns', async t => {
	const result = await runGlobby(t, ['!a.tmp', '!b.tmp'], {cwd: temporary, expandNegationOnlyPatterns: true});
	t.deepEqual(result, ['c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - stream async iterator support', async t => {
	const results = [];
	for await (const path of globbyStream('*.tmp')) {
		results.push(path);
	}

	t.deepEqual(results, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

/// test('glob - duplicated patterns', async t => {
// 	const result1 = await runGlobby(t, [`./${temporary}/**`, `./${temporary}`]);
// 	t.deepEqual(result1, ['./tmp/a.tmp', './tmp/b.tmp', './tmp/c.tmp', './tmp/d.tmp', './tmp/e.tmp']);
// 	const result2 = await runGlobby(t, [`./${temporary}`, `./${temporary}/**`]);
// 	t.deepEqual(result2, ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
// });

test.serial('cwd option', async t => {
	process.chdir(temporary);
	t.deepEqual(await runGlobby(t, '*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(await runGlobby(t, ['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test('don\'t mutate the options object', async t => {
	await runGlobby(t, ['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose isDynamicPattern', t => {
	t.true(isDynamicPattern('**'));
	t.true(isDynamicPattern(['**', 'path1', 'path2']));
	t.false(isDynamicPattern(['path1', 'path2']));

	for (const cwdDirectory of getPathValues(cwd)) {
		t.true(isDynamicPattern('**', {cwd: cwdDirectory}));
	}
});

test('expandDirectories option', async t => {
	t.deepEqual(await runGlobby(t, temporary), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	for (const temporaryDirectory of getPathValues(temporary)) {
		// eslint-disable-next-line no-await-in-loop
		t.deepEqual(await runGlobby(t, '**', {cwd: temporaryDirectory}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	}

	t.deepEqual(await runGlobby(t, temporary, {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(await runGlobby(t, temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(await runGlobby(t, temporary, {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
		ignore: ['**/b.tmp'],
	}), ['tmp/a.tmp']);
	t.deepEqual(await runGlobby(t, temporary, {
		expandDirectories: {
			extensions: ['tmp'],
		},
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('fs option preserves context during directory expansion', async t => {
	const fsImplementation = createContextAwareFs();
	const result = await runGlobby(t, temporary, {fs: fsImplementation});
	t.deepEqual(result, ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', async t => {
	t.deepEqual(await runGlobby(t, temporary, {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', async t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(await runGlobby(t, temporary, {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('expandDirectories and ignores option', async t => {
	t.deepEqual(await runGlobby(t, 'tmp', {
		ignore: ['tmp'],
	}), []);

	t.deepEqual(await runGlobby(t, 'tmp/**', {
		expandDirectories: false,
		ignore: ['tmp'],
	}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test('ignore option with trailing slashes on directories (issue #160)', async t => {
	const temporaryCwd = temporaryDirectory();
	const ignoreFirst = path.join(temporaryCwd, 'ignore-first');
	const ignoreSecond = path.join(temporaryCwd, 'ignore-second');
	const keepThis = path.join(temporaryCwd, 'keep-this.txt');

	fs.mkdirSync(ignoreFirst);
	fs.mkdirSync(ignoreSecond);
	fs.writeFileSync(path.join(ignoreFirst, 'file.txt'), '', 'utf8');
	fs.writeFileSync(path.join(ignoreSecond, 'file.txt'), '', 'utf8');
	fs.writeFileSync(keepThis, '', 'utf8');

	try {
		// Test with trailing slash on first directory
		const result1 = await runGlobby(t, '**/*', {
			cwd: temporaryCwd,
			ignore: ['ignore-first/', 'ignore-second'],
		});
		t.false(result1.some(file => file.includes('ignore-first')), 'ignore-first/ with trailing slash should be ignored');
		t.false(result1.some(file => file.includes('ignore-second')), 'ignore-second without trailing slash should be ignored');
		t.true(result1.includes('keep-this.txt'), 'keep-this.txt should not be ignored');

		// Test with trailing slashes on both directories
		const result2 = await runGlobby(t, '**/*', {
			cwd: temporaryCwd,
			ignore: ['ignore-first/', 'ignore-second/'],
		});
		t.false(result2.some(file => file.includes('ignore-first')), 'ignore-first/ should be ignored');
		t.false(result2.some(file => file.includes('ignore-second')), 'ignore-second/ should be ignored');
		t.true(result2.includes('keep-this.txt'), 'keep-this.txt should not be ignored');
	} finally {
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('absolute:true, expandDirectories:false, onlyFiles:false, gitignore:true and top level folder', async t => {
	const result = await runGlobby(t, '.', {
		absolute: true,
		cwd: path.resolve(temporary),
		expandDirectories: false,
		gitignore: true,
		onlyFiles: false,
	});

	t.is(result.length, 1);
	t.truthy(result[0].endsWith(temporary));
});

test.serial.failing('relative paths and ignores option', async t => {
	process.chdir(temporary);
	try {
		for (const temporaryCwd of getPathValues(process.cwd())) {
			// eslint-disable-next-line no-await-in-loop
			t.deepEqual(await runGlobby(t, '../tmp', {
				cwd: temporaryCwd,
				ignore: ['tmp'],
			}), []);
		}
	} finally {
		process.chdir(cwd);
	}
});

test.serial('parent directory patterns with ** ignore patterns (issue #90)', async t => {
	// Create a test directory structure: parent/child/node_modules
	const temporaryParent = temporaryDirectory();
	const temporaryChild = path.join(temporaryParent, 'child');
	const nodeModulesDir = path.join(temporaryParent, 'node_modules', 'foo');

	fs.mkdirSync(nodeModulesDir, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const testFile = path.join(temporaryParent, 'test.js');
	const nodeModulesFile = path.join(nodeModulesDir, 'index.js');
	const childFile = path.join(temporaryChild, 'child.js');

	fs.writeFileSync(testFile, '', 'utf8');
	fs.writeFileSync(nodeModulesFile, '', 'utf8');
	fs.writeFileSync(childFile, '', 'utf8');

	try {
		// Test with ignore option
		const result1 = await runGlobby(t, ['..'], {
			cwd: temporaryChild,
			ignore: ['**/node_modules/**'],
		});
		t.false(result1.some(p => p.includes('node_modules')), 'ignore option should exclude node_modules');

		// Test with negation pattern
		const result2 = await runGlobby(t, ['..', '!**/node_modules/**'], {
			cwd: temporaryChild,
		});
		t.false(result2.some(p => p.includes('node_modules')), 'negation pattern should exclude node_modules');

		// Both should include the non-node_modules files
		t.true(result1.some(p => p.endsWith('test.js')), 'should include test.js');
		t.true(result1.some(p => p.endsWith('child.js')), 'should include child.js');
	} finally {
		fs.rmSync(temporaryParent, {recursive: true, force: true});
	}
});

test.serial('parent directory patterns - multiple levels (../../)', async t => {
	const temporaryGrandparent = temporaryDirectory();
	const temporaryParent = path.join(temporaryGrandparent, 'parent');
	const temporaryChild = path.join(temporaryParent, 'child');
	const distDir = path.join(temporaryGrandparent, 'dist');

	fs.mkdirSync(distDir, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const rootFile = path.join(temporaryGrandparent, 'root.js');
	const distFile = path.join(distDir, 'bundle.js');

	fs.writeFileSync(rootFile, '', 'utf8');
	fs.writeFileSync(distFile, '', 'utf8');

	try {
		const result = await runGlobby(t, ['../..'], {
			cwd: temporaryChild,
			ignore: ['**/dist/**'],
		});

		t.false(result.some(p => p.includes('dist')), 'should exclude dist directory');
		t.true(result.some(p => p.endsWith('root.js')), 'should include root.js');
	} finally {
		fs.rmSync(temporaryGrandparent, {recursive: true, force: true});
	}
});

test.serial('parent directory patterns - already prefixed ignore patterns', async t => {
	const temporaryParent = temporaryDirectory();
	const temporaryChild = path.join(temporaryParent, 'child');
	const buildDir = path.join(temporaryParent, 'build');

	fs.mkdirSync(buildDir, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const buildFile = path.join(buildDir, 'output.js');
	const testFile = path.join(temporaryParent, 'test.js');

	fs.writeFileSync(buildFile, '', 'utf8');
	fs.writeFileSync(testFile, '', 'utf8');

	try {
		const result = await runGlobby(t, ['..'], {
			cwd: temporaryChild,
			ignore: ['../**/build/**'],
		});

		t.false(result.some(p => p.includes('build')), 'should exclude build with pre-prefixed ignore');
		t.true(result.some(p => p.endsWith('test.js')), 'should include test.js');
	} finally {
		fs.rmSync(temporaryParent, {recursive: true, force: true});
	}
});

test.serial('parent directory patterns - multiple ignore patterns', async t => {
	const temporaryParent = temporaryDirectory();
	const temporaryChild = path.join(temporaryParent, 'child');
	const nodeModulesDir = path.join(temporaryParent, 'node_modules');
	const distDir = path.join(temporaryParent, 'dist');
	const buildDir = path.join(temporaryParent, 'build');

	fs.mkdirSync(nodeModulesDir, {recursive: true});
	fs.mkdirSync(distDir, {recursive: true});
	fs.mkdirSync(buildDir, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const nodeModulesFile = path.join(nodeModulesDir, 'pkg.js');
	const distFile = path.join(distDir, 'bundle.js');
	const buildFile = path.join(buildDir, 'output.js');
	const sourceFile = path.join(temporaryParent, 'source.js');

	fs.writeFileSync(nodeModulesFile, '', 'utf8');
	fs.writeFileSync(distFile, '', 'utf8');
	fs.writeFileSync(buildFile, '', 'utf8');
	fs.writeFileSync(sourceFile, '', 'utf8');

	try {
		const result = await runGlobby(t, ['..'], {
			cwd: temporaryChild,
			ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
		});

		t.false(result.some(p => p.includes('node_modules')), 'should exclude node_modules');
		t.false(result.some(p => p.includes('dist')), 'should exclude dist');
		t.false(result.some(p => p.includes('build')), 'should exclude build');
		t.true(result.some(p => p.endsWith('source.js')), 'should include source.js');
	} finally {
		fs.rmSync(temporaryParent, {recursive: true, force: true});
	}
});

test.serial('parent directory patterns - mixed patterns should not adjust', async t => {
	const temporaryParent = temporaryDirectory();
	const temporaryChild = path.join(temporaryParent, 'child');
	const nodeModulesDir = path.join(temporaryParent, 'node_modules');
	const srcDir = path.join(temporaryChild, 'src');

	fs.mkdirSync(nodeModulesDir, {recursive: true});
	fs.mkdirSync(srcDir, {recursive: true});

	const nodeModulesFile = path.join(nodeModulesDir, 'pkg.js');
	const srcFile = path.join(srcDir, 'index.js');

	fs.writeFileSync(nodeModulesFile, '', 'utf8');
	fs.writeFileSync(srcFile, '', 'utf8');

	try {
		const result = await runGlobby(t, ['..', 'src'], {
			cwd: temporaryChild,
			ignore: ['**/node_modules/**'],
		});

		t.true(result.some(p => p.includes('node_modules')), 'should include node_modules when patterns have mixed bases');
		t.true(result.some(p => p.includes('src')), 'should include src files');
	} finally {
		fs.rmSync(temporaryParent, {recursive: true, force: true});
	}
});

test.serial('parent directory patterns - with same prefix patterns', async t => {
	const temporaryGrandparent = temporaryDirectory();
	const temporaryParent = path.join(temporaryGrandparent, 'parent');
	const temporaryChild = path.join(temporaryParent, 'child');
	const nodeModulesDir = path.join(temporaryGrandparent, 'node_modules');
	const libDir = path.join(temporaryGrandparent, 'lib');

	fs.mkdirSync(nodeModulesDir, {recursive: true});
	fs.mkdirSync(libDir, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const nodeModulesFile = path.join(nodeModulesDir, 'pkg.js');
	const libFile = path.join(libDir, 'helper.js');
	const rootFile = path.join(temporaryGrandparent, 'index.js');

	fs.writeFileSync(nodeModulesFile, '', 'utf8');
	fs.writeFileSync(libFile, '', 'utf8');
	fs.writeFileSync(rootFile, '', 'utf8');

	try {
		const result = await runGlobby(t, ['../../lib/**', '../../*.js'], {
			cwd: temporaryChild,
			ignore: ['**/node_modules/**'],
		});

		t.false(result.some(p => p.includes('node_modules')), 'should exclude node_modules with same prefix');
		t.true(result.some(p => p.endsWith('helper.js')), 'should include lib files');
		t.true(result.some(p => p.endsWith('index.js')), 'should include root js files');
	} finally {
		fs.rmSync(temporaryGrandparent, {recursive: true, force: true});
	}
});

// Rejected for being an invalid pattern
for (const value of invalidPatterns) {
	const valueString = format(value);
	const message = 'Patterns must be a string or an array of strings';

	test(`throws for invalid patterns input: ${valueString}`, async t => {
		await t.throwsAsync(globby(value), {instanceOf: TypeError, message});
		t.throws(() => globbySync(value), {instanceOf: TypeError, message});
		t.throws(() => globbyStream(value), {instanceOf: TypeError, message});
		t.throws(() => isDynamicPattern(value), {instanceOf: TypeError, message});
	});
}

test('gitignore option defaults to false - async', async t => {
	const actual = await runGlobby(t, '*', {onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('respects gitignore option true', async t => {
	const actual = await runGlobby(t, '*', {gitignore: true, onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects gitignore option false', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, onlyFiles: false});
	t.true(actual.includes('node_modules'));
});

test('gitignore option with stats option', async t => {
	const result = await runGlobby(t, '*', {gitignore: true, stats: true});
	const actual = result.map(x => x.path);
	t.false(actual.includes('node_modules'));
});

test('gitignore option with absolute option', async t => {
	const result = await runGlobby(t, '*', {gitignore: true, absolute: true});
	t.false(result.includes('node_modules'));
});

test('gitignore option and objectMode option', async t => {
	const result = await runGlobby(t, 'fixtures/gitignore/*', {gitignore: true, objectMode: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('gitignore option and suppressErrors option', async t => {
	const temporary = temporaryDirectory();
	fs.mkdirSync(path.join(temporary, 'foo'));
	fs.writeFileSync(path.join(temporary, '.gitignore'), 'baz', 'utf8');
	fs.writeFileSync(path.join(temporary, 'bar'), '', 'utf8');
	fs.writeFileSync(path.join(temporary, 'baz'), '', 'utf8');
	// Block access to "foo", which should be silently ignored.
	fs.chmodSync(path.join(temporary, 'foo'), 0o000);
	const result = await runGlobby(t, '**/*', {cwd: temporary, gitignore: true, suppressErrors: true});
	t.is(result.length, 1);
	t.truthy(result.includes('bar'));
});

test.serial('gitignore option loads parent gitignore files from git root', async t => {
	const repository = createTemporaryGitRepository();
	const childDirectory = path.join(repository, 'packages/app');

	fs.mkdirSync(childDirectory, {recursive: true});

	fs.writeFileSync(path.join(repository, '.gitignore'), 'root-ignored.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory, '.gitignore'), 'child-ignored.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'root-ignored.js'), '', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'child-ignored.js'), '', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'kept.js'), '', 'utf8');

	const result = await runGlobby(t, '*.js', {cwd: childDirectory, gitignore: true});
	t.deepEqual(result.sort(), ['kept.js']);
});

test('gitignore option works with promises-only fs when finding parent gitignores', async t => {
	const repository = createTemporaryGitRepository();
	const childDirectory = path.join(repository, 'packages/app');

	fs.mkdirSync(childDirectory, {recursive: true});

	fs.writeFileSync(path.join(repository, '.gitignore'), 'root-ignored.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'root-ignored.js'), '', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'kept.js'), '', 'utf8');

	const asyncOnlyFs = {
		promises: {
			readFile: fs.promises.readFile.bind(fs.promises),
			stat: fs.promises.stat.bind(fs.promises),
		},
	};

	const result = await globby('*.js', {
		cwd: childDirectory,
		gitignore: true,
		fs: asyncOnlyFs,
	});

	t.deepEqual(result, ['kept.js']);
});

test('gitignore option only loads parent gitignore files when inside a git repository', async t => {
	const repository = temporaryDirectory();
	const childDirectory1 = path.join(repository, 'child1');
	const childDirectory2 = path.join(repository, 'child2');

	fs.mkdirSync(childDirectory1, {recursive: true});
	fs.mkdirSync(childDirectory2, {recursive: true});

	fs.writeFileSync(path.join(repository, '.gitignore'), 'ignored.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory1, 'ignored.js'), '', 'utf8');

	// Test without git repository - parent gitignore should NOT be loaded
	const withoutGitRepository = await runGlobby(t, '*.js', {cwd: childDirectory1, gitignore: true});
	t.true(withoutGitRepository.includes('ignored.js'));

	// Add .git directory to make it a git repository
	fs.mkdirSync(path.join(repository, '.git'));
	fs.writeFileSync(path.join(childDirectory2, 'ignored.js'), '', 'utf8');

	// Test with git repository - parent gitignore SHOULD be loaded
	// Use a different child directory to avoid cache issues
	const withGitRepository = await runGlobby(t, '*.js', {cwd: childDirectory2, gitignore: true});
	t.false(withGitRepository.includes('ignored.js'));
});

test('gitignore option allows child gitignore files to override parent patterns', async t => {
	const repository = createTemporaryGitRepository();
	const childDirectory = path.join(repository, 'packages/app');

	fs.mkdirSync(childDirectory, {recursive: true});

	fs.writeFileSync(path.join(repository, '.gitignore'), '*.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory, '.gitignore'), '!keep.js\n', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'keep.js'), '', 'utf8');
	fs.writeFileSync(path.join(childDirectory, 'drop.js'), '', 'utf8');

	const result = await runGlobby(t, '*.js', {cwd: childDirectory, gitignore: true});
	t.deepEqual(result, ['keep.js']);
});

test('suppressErrors option with file patterns (issue #166)', async t => {
	const temporary = temporaryDirectory();
	fs.writeFileSync(path.join(temporary, 'validFile.txt'), 'test content', 'utf8');

	// Without suppressErrors, should throw when trying to treat file as directory
	await t.throwsAsync(
		globby(['validFile.txt', 'validFile.txt/**/*.txt'], {cwd: temporary}),
		{code: 'ENOTDIR'},
	);
	t.throws(
		() => globbySync(['validFile.txt', 'validFile.txt/**/*.txt'], {cwd: temporary}),
		{code: 'ENOTDIR'},
	);

	// With suppressErrors, should return the valid file and suppress the error
	const asyncResult = await runGlobby(t, ['validFile.txt', 'validFile.txt/**/*.txt'], {
		cwd: temporary,
		suppressErrors: true,
	});
	t.deepEqual(asyncResult, ['validFile.txt']);
});

test('nested gitignore with negation applies recursively to globby results (issue #255)', async t => {
	const cwd = path.join(PROJECT_ROOT, 'fixtures', 'gitignore-negation-nested');
	const result = await runGlobby(t, '**/*.txt', {cwd, gitignore: true});

	// Both y/a2.txt and y/z/a2.txt should be included despite root .gitignore having 'a*'
	// because y/.gitignore has '!a2.txt' which applies recursively
	t.true(result.includes('y/a2.txt'));
	t.true(result.includes('y/z/a2.txt'));

	// These should be excluded by 'a*' pattern
	t.false(result.includes('a1.txt'));
	t.false(result.includes('a2.txt'));
	t.false(result.includes('y/a1.txt'));
	t.false(result.includes('y/z/a1.txt'));
});

test.serial('parent directory patterns work with gitignore option (issue #133)', async t => {
	const temporaryParent = temporaryDirectory();
	const temporarySrc = path.join(temporaryParent, 'src');
	const temporaryChild = path.join(temporaryParent, 'child');

	fs.mkdirSync(temporarySrc, {recursive: true});
	fs.mkdirSync(temporaryChild, {recursive: true});

	const srcFile1 = path.join(temporarySrc, 'test1.ts');
	const srcFile2 = path.join(temporarySrc, 'test2.ts');

	fs.writeFileSync(srcFile1, 'content1', 'utf8');
	fs.writeFileSync(srcFile2, 'content2', 'utf8');

	// Add a .gitignore to ensure gitignore processing is active
	fs.writeFileSync(path.join(temporaryParent, '.gitignore'), 'node_modules\n', 'utf8');

	try {
		// Test relative parent directory pattern with gitignore:true
		const relativeResult = await runGlobby(t, '../src/*.ts', {
			cwd: temporaryChild,
			gitignore: true,
			absolute: false,
		});

		t.deepEqual(relativeResult.sort(), ['../src/test1.ts', '../src/test2.ts']);

		// Test absolute paths with gitignore:true
		const absoluteResult = await runGlobby(t, '../src/*.ts', {
			cwd: temporaryChild,
			gitignore: true,
			absolute: true,
		});

		t.is(absoluteResult.length, 2);
		t.true(absoluteResult.every(p => path.isAbsolute(p)));
		t.true(absoluteResult.some(p => p.endsWith('test1.ts')));
		t.true(absoluteResult.some(p => p.endsWith('test2.ts')));

		// Verify it still works with gitignore:false for consistency
		const withoutGitignoreResult = await runGlobby(t, '../src/*.ts', {
			cwd: temporaryChild,
			gitignore: false,
			absolute: false,
		});

		t.deepEqual(withoutGitignoreResult.sort(), ['../src/test1.ts', '../src/test2.ts']);
	} finally {
		fs.rmSync(temporaryParent, {recursive: true, force: true});
	}
});

test.serial('gitignore directory patterns stop fast-glob traversal', async t => {
	const temporaryCwd = temporaryDirectory();
	const gitignorePath = path.join(temporaryCwd, '.gitignore');
	const keepFile = path.join(temporaryCwd, 'keep.js');
	const nodeModulesFile = path.join(temporaryCwd, 'node_modules/foo/index.js');
	const nestedNodeModulesFile = path.join(temporaryCwd, 'packages/foo/node_modules/bar/index.js');
	fs.writeFileSync(gitignorePath, 'node_modules/\n', 'utf8');
	fs.mkdirSync(path.dirname(nodeModulesFile), {recursive: true});
	fs.mkdirSync(path.dirname(nestedNodeModulesFile), {recursive: true});
	fs.writeFileSync(nodeModulesFile, '', 'utf8');
	fs.writeFileSync(nestedNodeModulesFile, '', 'utf8');
	fs.writeFileSync(keepFile, '', 'utf8');

	const restoreFs = blockNodeModulesTraversal(temporaryCwd);

	try {
		const result = await runGlobby(t, '**/*.js', {
			cwd: temporaryCwd,
			gitignore: true,
		});
		t.deepEqual(result, ['keep.js']);
	} finally {
		restoreFs();
		fs.rmSync(temporaryCwd, {recursive: true, force: true});
	}
});

test('respects ignoreFiles string option', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: '.gitignore', onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('respects ignoreFiles array option', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: ['.gitignore'], onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('glob dot files', async t => {
	const actual = await runGlobby(t, '*', {gitignore: false, ignoreFiles: '*gitignore', onlyFiles: false});
	t.false(actual.includes('node_modules'));
});

test('`{extension: false}` and `expandDirectories.extensions` option', async t => {
	for (const temporaryDirectory of getPathValues(temporary)) {
		t.deepEqual(
			// eslint-disable-next-line no-await-in-loop
			await runGlobby(t, '*', {
				cwd: temporaryDirectory,
				extension: false,
				expandDirectories: {
					extensions: [
						'md',
						'tmp',
					],
				},
			}),
			[
				'a.tmp',
				'b.tmp',
				'c.tmp',
				'd.tmp',
				'e.tmp',
			],
		);
	}
});

test('throws when specifying a file as cwd', async t => {
	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('.', {cwd: file}), cwdDirectoryError);
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('*', {cwd: file}), cwdDirectoryError);
		t.throws(() => globbySync('.', {cwd: file}), cwdDirectoryError);
		t.throws(() => globbySync('*', {cwd: file}), cwdDirectoryError);
		t.throws(() => globbyStream('.', {cwd: file}), cwdDirectoryError);
		t.throws(() => globbyStream('*', {cwd: file}), cwdDirectoryError);
	}
});

test('throws when specifying a file as cwd - isDynamicPattern', t => {
	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		t.throws(() => {
			isDynamicPattern('.', {cwd: file});
		}, cwdDirectoryError);

		t.throws(() => {
			isDynamicPattern('*', {cwd: file});
		}, cwdDirectoryError);
	}
});

test('don\'t throw when specifying a non-existing cwd directory', async t => {
	for (const cwd of getPathValues('/unknown')) {
		// eslint-disable-next-line no-await-in-loop
		const actual = await runGlobby(t, '.', {cwd});
		t.is(actual.length, 0);
	}
});

test('unique when using objectMode option', async t => {
	const result = await runGlobby(t, ['a.tmp', '*.tmp'], {cwd, objectMode: true});
	t.true(isUnique(result.map(({path}) => path)));
});

test('stats option returns Entry objects with stats', async t => {
	const result = await runGlobby(t, '*.tmp', {cwd, stats: true});
	t.true(result.length > 0);
	for (const entry of result) {
		t.truthy(entry.path);
		t.truthy(entry.name);
		// Note: stats property exists but is filtered out in stabilizeResult for testing
	}
});

test('gitignore option and stats option', async t => {
	const result = await runGlobby(t, 'fixtures/gitignore/*', {gitignore: true, stats: true});
	t.is(result.length, 1);
	t.truthy(result[0].path);
});

test('unique when using stats option', async t => {
	const result = await runGlobby(t, ['a.tmp', '*.tmp'], {cwd, stats: true});
	t.true(isUnique(result.map(({path}) => path)));
});

// Known limitation: ** in parentheses doesn't work (fast-glob #484)
test.failing('** inside parentheses', async t => {
	const testDir = temporaryDirectory();
	fs.mkdirSync(path.join(testDir, 'test/utils'), {recursive: true});
	fs.writeFileSync(path.join(testDir, 'test/utils/file.js'), '');

	const result1 = await runGlobby(t, 'test(/utils/**)', {cwd: testDir});
	const result2 = await runGlobby(t, 'test/utils/**', {cwd: testDir});

	// This fails because ** in parentheses returns empty array
	t.deepEqual(result1, result2);
});

// Known limitation: patterns with quotes may not work (fast-glob #494)
test.failing('patterns with quotes in path segments', async t => {
	const testDir = temporaryDirectory();
	const quotedDir = path.join(testDir, '"quoted"');
	fs.mkdirSync(quotedDir, {recursive: true});
	fs.writeFileSync(path.join(quotedDir, 'file.js'), '');

	const result = await runGlobby(t, '"quoted"/**', {cwd: testDir});

	// This fails because quoted paths don't match correctly
	t.deepEqual(result, ['"quoted"/file.js']);
});

test('filter function manages path cache efficiently', async t => {
	// This test verifies that the path cache is managed properly
	// The seen Set should NOT be cleared as it's needed for deduplication
	const temporary = temporaryDirectory();

	// Create test files - some that will be ignored and some that won't
	for (let i = 0; i < 50; i++) {
		fs.writeFileSync(path.join(temporary, `file${i}.txt`), 'content');
		fs.writeFileSync(path.join(temporary, `ignored${i}.txt`), 'content');
	}

	// Create a gitignore to trigger path resolution
	fs.writeFileSync(path.join(temporary, '.gitignore'), 'ignored*.txt\n');

	// This should work correctly with path cache management
	const result = await runGlobby(t, '*.txt', {cwd: temporary, gitignore: true});

	// Should have files but not the ignored ones
	const ignoredFiles = result.filter(f => f.startsWith('ignored'));
	t.is(ignoredFiles.length, 0, 'No ignored files should be returned');
	t.is(result.length, 50, 'Should have exactly 50 non-ignored files');
	t.true(result.every(f => f.startsWith('file')), 'All results should be file*.txt');
});

test('parent gitignore files are found and cached correctly', async t => {
	const repository = createTemporaryGitRepository();
	const child1 = path.join(repository, 'packages/app1');
	const child2 = path.join(repository, 'packages/app2');

	fs.mkdirSync(child1, {recursive: true});
	fs.mkdirSync(child2, {recursive: true});

	// Create gitignore files
	fs.writeFileSync(path.join(repository, '.gitignore'), 'root-ignored.js\n');
	fs.writeFileSync(path.join(child1, '.gitignore'), 'child1-ignored.js\n');
	fs.writeFileSync(path.join(child2, '.gitignore'), 'child2-ignored.js\n');

	// Test files
	fs.writeFileSync(path.join(child1, 'root-ignored.js'), '');
	fs.writeFileSync(path.join(child1, 'child1-ignored.js'), '');
	fs.writeFileSync(path.join(child1, 'kept.js'), '');

	const result = await runGlobby(t, '*.js', {cwd: child1, gitignore: true});
	t.deepEqual(result.sort(), ['kept.js']);

	// Second call should use cache
	const result2 = await runGlobby(t, '*.js', {cwd: child1, gitignore: true});
	t.deepEqual(result2.sort(), ['kept.js']);
});

test('filter function caches resolved paths for performance', async t => {
	const temporary = temporaryDirectory();

	// Create test files
	for (let i = 0; i < 100; i++) {
		fs.writeFileSync(path.join(temporary, `file${i}.txt`), 'content');
	}

	// Create gitignore
	fs.writeFileSync(path.join(temporary, '.gitignore'), 'file5*.txt\n');

	// This should use path caching for repeated path resolution
	const result = await runGlobby(t, '*.txt', {cwd: temporary, gitignore: true});

	// Verify files starting with file5 are ignored
	const hasFile5x = result.some(file => file.startsWith('file5'));
	t.false(hasFile5x);

	// Other files should be present
	t.true(result.includes('file1.txt'));
	t.true(result.includes('file60.txt'));
});

test('handles string ignore option - async', async t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const result = await runGlobby(t, '*.tmp', {
		ignore: 'a.tmp',
		cwd: temporary,
	});

	t.false(result.includes('a.tmp'), 'should exclude ignored file');
	t.true(result.includes('b.tmp'), 'should include non-ignored file');
});

test('handles string ignore option - sync', t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const result = globbySync('*.tmp', {
		ignore: 'a.tmp',
		cwd: temporary,
	});

	t.false(result.includes('a.tmp'), 'should exclude ignored file');
	t.true(result.includes('b.tmp'), 'should include non-ignored file');
});

test('handles string ignore with negative patterns', async t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const result = await runGlobby(t, ['*.tmp', '!b.tmp'], {
		ignore: 'c.tmp',
		cwd: temporary,
	});

	t.false(result.includes('b.tmp'), 'negative pattern should exclude file');
	t.false(result.includes('c.tmp'), 'ignore option should exclude file');
	t.true(result.includes('a.tmp'), 'should include non-ignored file');
});

test('handles string ignore with directory expansion', async t => {
	const temporary = temporaryDirectory();
	fs.mkdirSync(path.join(temporary, 'subdir'), {recursive: true});
	fs.writeFileSync(path.join(temporary, 'subdir', 'file.txt'), 'content');

	const result = await runGlobby(t, 'subdir', {
		ignore: '.git',
		expandDirectories: true,
		cwd: temporary,
	});

	t.true(Array.isArray(result), 'should return an array');
	t.true(result.some(file => file.includes('file.txt')), 'should find file in directory');
});

test('handles custom fs with callback-style stat', async t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const customFs = {
		stat(filePath, callback) {
			// Simulate callback-style stat
			process.nextTick(() => {
				callback(null, {
					isDirectory() {
						return false;
					},
				});
			});
		},
	};

	// This used to fail with "callback must be a function"
	const result = await runGlobby(t, '*.tmp', {
		fs: customFs,
		expandDirectories: false,
		cwd: temporary,
	});

	t.true(Array.isArray(result), 'should handle callback-style fs.stat');
});

test('handles custom fs with callback-style readFile', async t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const customFs = {
		readFile(filePath, encoding, callback) {
			// Handle both (path, callback) and (path, encoding, callback)
			if (typeof encoding === 'function') {
				callback = encoding;
				encoding = undefined;
			}

			// Simulate callback-style readFile
			process.nextTick(() => {
				if (filePath.endsWith('.gitignore')) {
					// Return string when encoding is specified
					const content = encoding === 'utf8' ? 'a.tmp' : Buffer.from('a.tmp');
					callback(null, content);
				} else {
					callback(new Error('File not found'));
				}
			});
		},
	};

	// Create a .gitignore file
	fs.writeFileSync(path.join(temporary, '.gitignore'), 'dummy');

	// This used to fail with "callback must be a function"
	await t.notThrowsAsync(
		runGlobby(t, '*.tmp', {
			gitignore: true,
			fs: customFs,
			expandDirectories: false,
			cwd: temporary,
		}),
		'should handle callback-style fs.readFile',
	);
});

test('integration test with string ignore and custom fs', async t => {
	const temporary = temporaryDirectory();
	// Create test files
	for (const element of fixture) {
		fs.writeFileSync(path.join(temporary, element), '');
	}

	const customFs = {
		promises: {
			stat: async () => ({
				isDirectory() {
					return false;
				},
			}),
			async readFile(path, encoding) {
				// Return string when encoding is specified (as ignore.js expects)
				return encoding === 'utf8' ? '' : Buffer.from('');
			},
		},
	};

	// Combines string ignore (fix #1) with custom fs (fixes #2-3)
	await t.notThrowsAsync(
		runGlobby(t, '*.tmp', {
			ignore: 'a.tmp',
			gitignore: true,
			fs: customFs,
			expandDirectories: false,
			cwd: temporary,
		}),
		'should handle all fixes together',
	);
});
