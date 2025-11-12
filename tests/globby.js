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
import {normalizeDirectoryPatternForFastGlob} from '../utilities.js';
import {
	PROJECT_ROOT,
	createContextAwareFs,
	getPathValues,
	invalidPatterns,
	isUnique,
} from './utilities.js';

const cwd = process.cwd();
const temporary = 'tmp';

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
	const error = {message: 'The `cwd` option must be a path to a directory'};

	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('.', {cwd: file}), error);
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(globby('*', {cwd: file}), error);
		t.throws(() => globbySync('.', {cwd: file}), error);
		t.throws(() => globbySync('*', {cwd: file}), error);
		t.throws(() => globbyStream('.', {cwd: file}), error);
		t.throws(() => globbyStream('*', {cwd: file}), error);
	}
});

test('throws when specifying a file as cwd - isDynamicPattern', t => {
	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		t.throws(() => {
			isDynamicPattern('.', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});

		t.throws(() => {
			isDynamicPattern('*', {cwd: file});
		}, {message: 'The `cwd` option must be a path to a directory'});
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
