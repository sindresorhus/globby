import test from 'ava';
import {getParentDirectoryPrefix, adjustIgnorePatternsForParentDirectories} from '../utilities.js';

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
