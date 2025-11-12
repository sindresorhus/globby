import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {
	getParentDirectoryPrefix,
	adjustIgnorePatternsForParentDirectories,
	getParentGitignorePaths,
	findGitRoot,
	findGitRootSync,
	convertPatternsForFastGlob,
} from '../utilities.js';

const createVirtualGitFs = gitDirectories => {
	const stats = {
		isDirectory() {
			return true;
		},
		isFile() {
			return false;
		},
	};

	const statForPath = filePath => {
		const normalizedPath = path.resolve(filePath);
		if (gitDirectories.has(normalizedPath)) {
			return stats;
		}

		const error = new Error('Path not found');
		error.code = 'ENOENT';
		throw error;
	};

	return {
		statSync: statForPath,
		promises: {
			stat: async filePath => statForPath(filePath),
		},
	};
};

test('getParentDirectoryPrefix - single parent directory', t => {
	t.is(getParentDirectoryPrefix('../foo'), '../');
	t.is(getParentDirectoryPrefix('../**'), '../');
	t.is(getParentDirectoryPrefix('../*.js'), '../');
});

test('getParentDirectoryPrefix - multiple parent directories', t => {
	t.is(getParentDirectoryPrefix('../../foo'), '../../');
	t.is(getParentDirectoryPrefix('../../../bar/**'), '../../../');
});

test('getParentDirectoryPrefix - no parent directory', t => {
	t.is(getParentDirectoryPrefix('foo'), '');
	t.is(getParentDirectoryPrefix('src/**'), '');
	t.is(getParentDirectoryPrefix('**/*.js'), '');
});

test('getParentDirectoryPrefix - relative current directory', t => {
	t.is(getParentDirectoryPrefix('./foo'), '');
	t.is(getParentDirectoryPrefix('./src/**'), '');
});

test('getParentDirectoryPrefix - ignores negation prefix', t => {
	t.is(getParentDirectoryPrefix('!../foo'), '../');
	t.is(getParentDirectoryPrefix('!../../bar/**'), '../../');
});

test('adjustIgnorePatternsForParentDirectories - single level parent', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['**/node_modules/**', '**/dist/**'],
	);
	t.deepEqual(result, ['../**/node_modules/**', '../**/dist/**']);
});

test('adjustIgnorePatternsForParentDirectories - double level parent', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../../foo/**'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['../../**/node_modules/**']);
});

test('adjustIgnorePatternsForParentDirectories - no adjustment for non-globstar patterns', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['node_modules/**', 'dist/'],
	);
	t.deepEqual(result, ['node_modules/**', 'dist/']);
});

test('adjustIgnorePatternsForParentDirectories - already prefixed ignores', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['../**/build/**', '**/node_modules/**'],
	);
	t.deepEqual(result, ['../**/build/**', '../**/node_modules/**']);
});

test('adjustIgnorePatternsForParentDirectories - mixed pattern bases', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**', 'src/**'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['**/node_modules/**'], 'should not adjust when patterns have different bases');
});

test('adjustIgnorePatternsForParentDirectories - all patterns with same prefix', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../../lib/**', '../../*.js'],
		['**/test/**'],
	);
	t.deepEqual(result, ['../../**/test/**']);
});

test('adjustIgnorePatternsForParentDirectories - no parent directories', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['src/**', 'lib/**'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['**/node_modules/**'], 'should not adjust when no parent directories');
});

test('adjustIgnorePatternsForParentDirectories - empty ignore array', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		[],
	);
	t.deepEqual(result, []);
});

test('adjustIgnorePatternsForParentDirectories - empty pattern array', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		[],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['**/node_modules/**']);
});

test('adjustIgnorePatternsForParentDirectories - mixed globstar and non-globstar', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['**/node_modules/**', 'build/', 'dist/**', '**/test/**'],
	);
	t.deepEqual(result, ['../**/node_modules/**', 'build/', 'dist/**', '../**/test/**']);
});

test('adjustIgnorePatternsForParentDirectories - negated patterns still adjust', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**', '!../dist/**'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['../**/node_modules/**']);
});

test('adjustIgnorePatternsForParentDirectories - patterns with different parent levels', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**', '../../bar/**'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['**/node_modules/**'], 'should not adjust when parent levels differ');
});

test('adjustIgnorePatternsForParentDirectories - single pattern single ignore', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../foo'],
		['**/node_modules/**'],
	);
	t.deepEqual(result, ['../**/node_modules/**']);
});

test('adjustIgnorePatternsForParentDirectories - ignore with leading slash', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['/absolute/path/**', '**/node_modules/**'],
	);
	t.deepEqual(result, ['/absolute/path/**', '../**/node_modules/**'], 'should not adjust absolute paths');
});

test('adjustIgnorePatternsForParentDirectories - bare ** pattern', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../**'],
		['**'],
	);
	t.deepEqual(result, ['**'], 'bare ** without trailing slash is not adjusted');
});

test('adjustIgnorePatternsForParentDirectories - empty string in patterns', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['', '../**'],
		['**/test/**'],
	);
	t.deepEqual(result, ['**/test/**'], 'mixed empty and parent patterns should not adjust');
});

test('adjustIgnorePatternsForParentDirectories - many parent levels', t => {
	const result = adjustIgnorePatternsForParentDirectories(
		['../../../../../deep/**'],
		['**/test/**', '**/node_modules/**'],
	);
	t.deepEqual(result, ['../../../../../**/test/**', '../../../../../**/node_modules/**']);
});

test('getParentDirectoryPrefix - pattern without trailing slash', t => {
	t.is(getParentDirectoryPrefix('..'), '', 'pattern without trailing slash returns empty string');
	t.is(getParentDirectoryPrefix('../..'), '../', 'matches only first .. with slash');
});

test('getParentDirectoryPrefix - three dots', t => {
	t.is(getParentDirectoryPrefix('.../foo'), '', 'three dots is not a valid parent reference');
});

test('getParentGitignorePaths includes git root when repo is at filesystem root', t => {
	const filesystemRoot = path.parse(process.cwd()).root;
	const projectDirectory = path.join(filesystemRoot, 'project');
	const packagesDirectory = path.join(projectDirectory, 'packages');
	const childDirectory = path.join(packagesDirectory, 'app');

	const result = getParentGitignorePaths(filesystemRoot, childDirectory);

	t.deepEqual(result, [
		path.join(filesystemRoot, '.gitignore'),
		path.join(projectDirectory, '.gitignore'),
		path.join(packagesDirectory, '.gitignore'),
		path.join(childDirectory, '.gitignore'),
	]);
});

test('getParentGitignorePaths returns empty when cwd is outside git root', t => {
	const gitRoot = path.join(process.cwd(), 'repo-root');
	const outsideDirectory = path.resolve(gitRoot, '..', 'sibling');

	const result = getParentGitignorePaths(gitRoot, outsideDirectory);

	t.deepEqual(result, []);
});

// Tests for input validation
test('findGitRoot validates cwd parameter', async t => {
	await t.throwsAsync(
		() => findGitRoot(123),
		{instanceOf: TypeError, message: 'cwd must be a string'},
	);

	await t.throwsAsync(
		() => findGitRoot(null),
		{instanceOf: TypeError, message: 'cwd must be a string'},
	);

	t.throws(
		() => findGitRootSync(undefined),
		{instanceOf: TypeError, message: 'cwd must be a string'},
	);
});

test('getParentGitignorePaths validates parameters', t => {
	t.throws(
		() => getParentGitignorePaths('valid', 123),
		{instanceOf: TypeError, message: 'cwd must be a string'},
	);

	t.throws(
		() => getParentGitignorePaths(123, 'valid'),
		{instanceOf: TypeError, message: 'gitRoot must be a string or undefined'},
	);

	// Should not throw with valid parameters
	t.notThrows(() => getParentGitignorePaths('/git/root', '/git/root/sub'));
	t.notThrows(() => getParentGitignorePaths(undefined, '/some/path'));
});

test('findGitRoot reflects repositories created after the first lookup', async t => {
	const projectRoot = path.join(temporaryDirectory(), 'project');
	fs.mkdirSync(projectRoot, {recursive: true});

	t.is(await findGitRoot(projectRoot), undefined);
	t.is(findGitRootSync(projectRoot), undefined);

	fs.mkdirSync(path.join(projectRoot, '.git'));

	t.is(await findGitRoot(projectRoot), projectRoot);
	t.is(findGitRootSync(projectRoot), projectRoot);
});

test('findGitRoot respects custom filesystem implementations', async t => {
	const virtualProjectRoot = path.join(temporaryDirectory(), 'virtual-project');
	fs.mkdirSync(virtualProjectRoot, {recursive: true});

	t.is(await findGitRoot(virtualProjectRoot), undefined);
	t.is(findGitRootSync(virtualProjectRoot), undefined);

	const virtualFs = createVirtualGitFs(new Set([path.join(virtualProjectRoot, '.git')]));

	t.is(await findGitRoot(virtualProjectRoot, virtualFs), virtualProjectRoot);
	t.is(findGitRootSync(virtualProjectRoot, virtualFs), virtualProjectRoot);
});

// Test for pattern conversion optimization
test('convertPatternsForFastGlob optimizes with single pass', t => {
	const normalizer = pattern => `normalized:${pattern}`;

	// Test early exit on first negation
	const patterns1 = ['file1.js', 'file2.js', '!important.js', 'file3.js'];
	const result1 = convertPatternsForFastGlob(patterns1, false, normalizer);
	t.deepEqual(result1, []); // Should return empty on negation

	// Test with no negations
	const patterns2 = ['file1.js', 'file2.js', 'file3.js'];
	const result2 = convertPatternsForFastGlob(patterns2, false, normalizer);
	t.deepEqual(result2, [
		'normalized:file1.js',
		'normalized:file2.js',
		'normalized:file3.js',
	]);

	// Test with git root
	const result3 = convertPatternsForFastGlob(patterns2, true, normalizer);
	t.deepEqual(result3, []); // Should return empty when using git root
});

// Test for no stack overflow with deep directories
test('findGitRoot handles deep directory structures without stack overflow', async t => {
	const temporary = temporaryDirectory();

	// Create a deep directory structure (100 levels to avoid filesystem limits)
	let deepPath = temporary;
	for (let i = 0; i < 100; i++) {
		deepPath = path.join(deepPath, `level${i % 10}`);
	}

	fs.mkdirSync(deepPath, {recursive: true});

	// Should not cause stack overflow
	const result = await findGitRoot(deepPath);
	t.is(result, undefined); // No git root found

	const syncResult = findGitRootSync(deepPath);
	t.is(syncResult, undefined);
});
