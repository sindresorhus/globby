import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {globby, globbySync, convertPathToPattern} from '../index.js';

// Tests for convertPathToPattern()
// Special glob characters like (), [], {} in literal paths must be escaped

const testDirectory = 'temp-convert-path';

test.before(() => {
	// Create test directories with special characters
	const directories = [
		path.join(testDirectory, 'Program Files (x86)', 'app'),
		path.join(testDirectory, 'Folder [a-z]', 'data'),
		path.join(testDirectory, 'Normal Folder', 'files'),
	];

	for (const directory of directories) {
		fs.mkdirSync(directory, {recursive: true});
		fs.writeFileSync(path.join(directory, 'test.txt'), 'content');
		fs.writeFileSync(path.join(directory, 'test.js'), 'content');
	}
});

test.after.always(() => {
	if (fs.existsSync(testDirectory)) {
		fs.rmSync(testDirectory, {recursive: true, force: true});
	}
});

test('paths with parentheses fail without convertPathToPattern', t => {
	const directory = path.join(testDirectory, 'Program Files (x86)', 'app');
	const pattern = directory.replaceAll(path.sep, '/') + '/*.txt';

	// Without escaping, parentheses are interpreted as extglob syntax
	const result = globbySync(pattern);
	t.deepEqual(result, []);
});

test('paths with bracket ranges fail without convertPathToPattern', t => {
	const directory = path.join(testDirectory, 'Folder [a-z]', 'data');
	const pattern = directory.replaceAll(path.sep, '/') + '/*.txt';

	// Without escaping, [a-z] is interpreted as a character class
	const result = globbySync(pattern);
	t.deepEqual(result, []);
});

test('paths with parentheses work with convertPathToPattern', t => {
	const directory = path.join(testDirectory, 'Program Files (x86)', 'app');
	const pattern = convertPathToPattern(directory) + '/*.txt';

	const result = globbySync(pattern);
	t.is(result.length, 1);
	t.true(result[0].includes('test.txt'));
});

test('paths with bracket ranges work with convertPathToPattern', t => {
	const directory = path.join(testDirectory, 'Folder [a-z]', 'data');
	const pattern = convertPathToPattern(directory) + '/*.txt';

	const result = globbySync(pattern);
	t.is(result.length, 1);
	t.true(result[0].includes('test.txt'));
});

test('paths with only spaces work without convertPathToPattern', t => {
	const directory = path.join(testDirectory, 'Normal Folder', 'files');
	const pattern = directory.replaceAll(path.sep, '/') + '/*.txt';

	// Spaces don't need escaping in glob patterns
	const result = globbySync(pattern);
	t.is(result.length, 1);
	t.true(result[0].includes('test.txt'));
});

test('async version works with convertPathToPattern', async t => {
	const directory = path.join(testDirectory, 'Program Files (x86)', 'app');
	const pattern = convertPathToPattern(directory) + '/*.txt';

	const result = await globby(pattern);
	t.is(result.length, 1);
	t.true(result[0].includes('test.txt'));
});

test('combining converted path with glob pattern', t => {
	const directory = path.join(testDirectory, 'Program Files (x86)', 'app');
	const pattern = convertPathToPattern(directory) + '/*.{txt,js}';

	const result = globbySync(pattern);
	t.is(result.length, 2);
});

test('recursive glob through directory with special characters', t => {
	// Recursive patterns work because they traverse all directories
	// without needing to match the exact directory name
	const pattern = testDirectory + '/**/*.txt';

	const result = globbySync(pattern);
	t.true(result.length >= 3); // At least 3 test.txt files

	// Verify all expected files are found
	const expectedPaths = [
		'Program Files (x86)/app/test.txt',
		'Folder [a-z]/data/test.txt',
		'Normal Folder/files/test.txt',
	];

	for (const expectedPath of expectedPaths) {
		t.true(result.some(file => file.includes(expectedPath)));
	}
});
