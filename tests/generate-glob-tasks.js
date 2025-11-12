import {format} from 'node:util';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {
	generateGlobTasks,
	generateGlobTasksSync,
} from '../index.js';
import {
	invalidPatterns,
	getPathValues,
	isUnique,
} from './utilities.js';

const runGenerateGlobTasks = async (t, patterns, options) => {
	const promiseResult = await generateGlobTasks(patterns, options);
	const syncResult = generateGlobTasksSync(patterns, options);

	t.deepEqual(
		promiseResult,
		syncResult,
		'generateGlobTasksSync() result is different than generateGlobTasks()',
	);

	return promiseResult;
};

const getTasks = async (t, patterns, options) => {
	const tasks = await runGenerateGlobTasks(t, patterns, options);
	return tasks.map(({patterns, options: {ignore}}) => ({patterns, ignore}));
};

test('generateGlobTasks', async t => {
	const tasks = await runGenerateGlobTasks(t, ['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.deepEqual(tasks[0].patterns, ['*.tmp']);
	t.deepEqual(tasks[0].options.ignore, ['c.tmp', 'b.tmp']);
	await t.notThrowsAsync(generateGlobTasks('*'));
	t.notThrows(() => generateGlobTasksSync('*'));
});

// Rejected for being an invalid pattern
for (const value of invalidPatterns) {
	const valueString = format(value);
	const message = 'Patterns must be a string or an array of strings';

	test(`throws for invalid patterns input: ${valueString}`, async t => {
		await t.throwsAsync(generateGlobTasks(value), {instanceOf: TypeError, message});
		t.throws(() => generateGlobTasksSync(value), {instanceOf: TypeError, message});
	});
}

test('throws when specifying a file as cwd', async t => {
	const error = {message: 'The `cwd` option must be a path to a directory'};

	for (const file of getPathValues(path.resolve('fixtures/gitignore/bar.js'))) {
		// eslint-disable-next-line no-await-in-loop
		await t.throwsAsync(generateGlobTasks('*', {cwd: file}), error);
		t.throws(() => generateGlobTasksSync('*', {cwd: file}), error);
	}
});

test('cwd', async t => {
	const cwd = process.cwd();
	for (const cwdDirectory of getPathValues(cwd)) {
		// eslint-disable-next-line no-await-in-loop
		const [task] = await runGenerateGlobTasks(t, ['*'], {cwd: cwdDirectory});
		t.is(task.options.cwd, cwd);
	}
});

test('expandDirectories option', async t => {
	{
		const tasks = await runGenerateGlobTasks(t, ['fixtures'], {ignore: ['fixtures/negative']});
		t.is(tasks.length, 1);
		t.deepEqual(tasks[0].patterns, ['fixtures/**']);
		t.deepEqual(tasks[0].options.ignore, ['fixtures/negative/**']);
	}

	{
		const tasks = await runGenerateGlobTasks(t, ['fixtures'], {ignore: ['fixtures/negative'], expandDirectories: false});
		t.is(tasks.length, 1);
		t.deepEqual(tasks[0].patterns, ['fixtures']);
		t.deepEqual(tasks[0].options.ignore, ['fixtures/negative']);
	}

	{
		const tasks = await runGenerateGlobTasks(t, ['fixtures'], {expandDirectories: ['a*', 'b*']});
		t.is(tasks.length, 1);
		t.deepEqual(tasks[0].patterns, ['fixtures/**/a*', 'fixtures/**/b*']);
		t.deepEqual(tasks[0].options.ignore, []);
	}

	{
		const tasks = await runGenerateGlobTasks(t, ['fixtures'], {
			expandDirectories: {
				files: ['a', 'b*'],
				extensions: ['tmp', 'txt'],
			},
			ignore: ['**/b.tmp'],
		});
		t.is(tasks.length, 1);
		t.deepEqual(tasks[0].patterns, ['fixtures/**/a.{tmp,txt}', 'fixtures/**/b*.{tmp,txt}']);
		t.deepEqual(tasks[0].options.ignore, ['**/b.tmp']);
	}
});

test('adjust ignore patterns when expandDirectories is false', async t => {
	const tasks = await runGenerateGlobTasks(t, ['../**'], {
		ignore: ['**/node_modules/**'],
		expandDirectories: false,
	});

	t.deepEqual(tasks[0].options.ignore, ['../**/node_modules/**']);
});

test('combine tasks', async t => {
	t.deepEqual(
		await getTasks(t, ['a', 'b']),
		[{patterns: ['a', 'b'], ignore: []}],
	);

	t.deepEqual(
		await getTasks(t, ['!a', 'b']),
		[{patterns: ['b'], ignore: []}],
	);

	t.deepEqual(
		await getTasks(t, ['!a']),
		[{patterns: ['**/*'], ignore: ['a']}],
	);

	t.deepEqual(
		await getTasks(t, ['a', 'b', '!c', '!d']),
		[{patterns: ['a', 'b'], ignore: ['c', 'd']}],
	);

	t.deepEqual(
		await getTasks(t, ['a', 'b', '!c', '!d', 'e']),
		[
			{patterns: ['a', 'b'], ignore: ['c', 'd']},
			{patterns: ['e'], ignore: []},
		],
	);

	t.deepEqual(
		await getTasks(t, ['a', 'b', '!c', 'd', 'e', '!f', '!g', 'h']),
		[
			{patterns: ['a', 'b'], ignore: ['c', 'f', 'g']},
			{patterns: ['d', 'e'], ignore: ['f', 'g']},
			{patterns: ['h'], ignore: []},
		],
	);
});

test('random patterns', async t => {
	for (let index = 0; index < 500; index++) {
		const positivePatterns = [];
		const negativePatterns = [];
		const negativePatternsAtStart = [];

		const patterns = Array.from({length: 1 + Math.floor(Math.random() * 20)}, (_, index) => {
			const negative = Math.random() > 0.5;
			let pattern = String(index + 1);
			if (negative) {
				negativePatterns.push(pattern);

				if (positivePatterns.length === 0) {
					negativePatternsAtStart.push(pattern);
				}

				pattern = `!${pattern}`;
			} else {
				positivePatterns.push(pattern);
			}

			return pattern;
		});

		// eslint-disable-next-line no-await-in-loop
		const tasks = await getTasks(t, patterns);
		const patternsToDebug = JSON.stringify(patterns);

		t.true(
			tasks.length <= negativePatterns.length - negativePatternsAtStart.length + 1,
			`Unexpected tasks: ${patternsToDebug}`,
		);

		for (const [index, {patterns, ignore}] of tasks.entries()) {
			t.not(
				patterns.length,
				0,
				`Unexpected empty patterns: ${patternsToDebug}`,
			);

			t.true(
				isUnique(patterns),
				`patterns should be unique: ${patternsToDebug}`,
			);

			t.true(
				isUnique(ignore),
				`ignore should be unique: ${patternsToDebug}`,
			);

			if (index !== 0 && ignore.length > 0) {
				t.deepEqual(
					tasks[index - 1].ignore.slice(-ignore.length),
					ignore,
					`Unexpected ignore: ${patternsToDebug}`,
				);
			}
		}

		const allPatterns = tasks.flatMap(({patterns}) => patterns);
		const allIgnore = tasks.flatMap(({ignore}) => ignore);

		// When there are only negative patterns, we auto-add '**/*' as a positive pattern
		const isNegationOnly = positivePatterns.length === 0 && negativePatterns.length > 0;
		const expectedPatternCount = isNegationOnly ? 1 : positivePatterns.length;

		t.is(
			new Set(allPatterns).size,
			expectedPatternCount,
			`positive patterns should be in patterns: ${patternsToDebug}`,
		);

		// When there are only negative patterns, all of them go into ignore (including negativePatternsAtStart)
		// Otherwise, negativePatternsAtStart are discarded
		const expectedIgnoreCount = isNegationOnly
			? negativePatterns.length
			: negativePatterns.length - negativePatternsAtStart.length;

		t.is(
			new Set(allIgnore).size,
			expectedIgnoreCount,
			`negative patterns should be in ignore: ${patternsToDebug}`,
		);
	}
});

// Test for https://github.com/sindresorhus/globby/issues/147
test('expandDirectories should work with globstar prefix', async t => {
	const cwd = temporaryDirectory();
	const filePath = path.join(cwd, 'a', 'b');
	fs.mkdirSync(filePath, {recursive: true});
	const tasks = await runGenerateGlobTasks(t, ['**/b'], {cwd});
	t.is(tasks.length, 1);
	t.deepEqual(tasks[0].patterns, ['**/b/**']);
});

test('expandDirectories should not expand invalid globstar patterns', async t => {
	const cwd = temporaryDirectory();
	const filePath = path.join(cwd, 'a', 'b');
	fs.mkdirSync(filePath, {recursive: true});

	// Test patterns that should NOT be expanded
	const invalidPatterns = [
		'**/b.txt', // File pattern with extension
		'**/*', // Wildcard pattern
		'**', // Just globstar
		'**/b/c', // Path with slash
		'**/b?', // Question mark wildcard
		'**/b[abc]', // Bracket wildcard
	];

	for (const pattern of invalidPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.is(tasks.length, 1, `Pattern ${pattern} should not be expanded`);
		t.deepEqual(tasks[0].patterns, [pattern], `Pattern ${pattern} should remain unchanged`);
	}
});

test('expandDirectories should work with globstar in middle of pattern', async t => {
	const cwd = temporaryDirectory();

	// Create nested directory structure
	fs.mkdirSync(path.join(cwd, 'src', 'components', 'button'), {recursive: true});
	fs.mkdirSync(path.join(cwd, 'lib', 'utils', 'button'), {recursive: true});

	// Test patterns with globstar not at the start
	const validPatterns = [
		{pattern: 'src/**/button', expected: 'src/**/button/**'},
		{pattern: 'lib/**/button', expected: 'lib/**/button/**'},
		{pattern: 'src/components/**/button', expected: 'src/components/**/button/**'},
	];

	for (const {pattern, expected} of validPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.is(tasks.length, 1, `Pattern ${pattern} should generate one task`);
		t.deepEqual(tasks[0].patterns, [expected], `Pattern ${pattern} should expand to ${expected}`);
	}

	// Test patterns that should NOT be expanded (even with globstar in middle)
	const invalidMiddlePatterns = [
		'src/**/button.js', // File extension
		'src/**/*', // Wildcard after globstar
		'src/**/button/index', // Additional path after globstar directory
		'src/**/button?', // Question mark wildcard
	];

	for (const pattern of invalidMiddlePatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.is(tasks.length, 1, `Pattern ${pattern} should not be expanded`);
		t.deepEqual(tasks[0].patterns, [pattern], `Pattern ${pattern} should remain unchanged`);
	}
});

test('expandDirectories critical edge cases', async t => {
	const cwd = temporaryDirectory();

	// Create test directories with various edge case names
	fs.mkdirSync(path.join(cwd, '.git'), {recursive: true});
	fs.mkdirSync(path.join(cwd, '.vscode'), {recursive: true});
	fs.mkdirSync(path.join(cwd, 'node.js'), {recursive: true}); // Directory that looks like a file
	fs.mkdirSync(path.join(cwd, 'build-output'), {recursive: true}); // Hyphens
	fs.mkdirSync(path.join(cwd, 'test_files'), {recursive: true}); // Underscores
	fs.mkdirSync(path.join(cwd, 'v1.0.0'), {recursive: true}); // Dots in name
	fs.mkdirSync(path.join(cwd, '文件夹'), {recursive: true}); // Unicode Chinese
	fs.mkdirSync(path.join(cwd, 'café'), {recursive: true}); // Unicode accents
	fs.mkdirSync(path.join(cwd, '@scope'), {recursive: true}); // Npm scope style

	// Test hidden directories (should expand - they're valid directory names)
	const hiddenDirectoryPatterns = [
		{pattern: '**/.git', expected: '**/.git/**'},
		{pattern: '**/.vscode', expected: '**/.vscode/**'},
	];

	for (const {pattern, expected} of hiddenDirectoryPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.is(tasks.length, 1, `Hidden directory pattern ${pattern} should generate one task`);
		t.deepEqual(tasks[0].patterns, [expected], `Hidden directory ${pattern} should expand to ${expected}`);
	}

	// Test directories that look like files (should expand if no actual extension)
	const ambiguousPatterns = [
		{pattern: '**/node.js', expected: '**/node.js', shouldExpand: false}, // Has .js extension
		{pattern: '**/build-output', expected: '**/build-output/**', shouldExpand: true}, // Hyphens OK
		{pattern: '**/test_files', expected: '**/test_files/**', shouldExpand: true}, // Underscores OK
		{pattern: '**/v1.0.0', expected: '**/v1.0.0', shouldExpand: false}, // Has extension .0
		{pattern: '**/@scope', expected: '**/@scope/**', shouldExpand: true}, // Special chars OK
	];

	for (const {pattern, expected, shouldExpand} of ambiguousPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		const message = shouldExpand ? 'should expand' : 'should not expand';
		t.deepEqual(tasks[0].patterns, [expected], `Pattern ${pattern} ${message}`);
	}

	// Test Unicode directory names (should expand)
	const unicodePatterns = [
		{pattern: '**/文件夹', expected: '**/文件夹/**'}, // Chinese
		{pattern: '**/café', expected: '**/café/**'}, // French accents
	];

	for (const {pattern, expected} of unicodePatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.deepEqual(tasks[0].patterns, [expected], `Unicode pattern ${pattern} should expand to ${expected}`);
	}
});

test('expandDirectories with negative patterns', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'src', 'components'), {recursive: true});
	fs.mkdirSync(path.join(cwd, 'lib', 'components'), {recursive: true});

	// Test negative patterns with globstar directories
	const negativePatterns = [
		{
			patterns: ['**/components', '!lib/**/components'],
			expected: {
				positive: ['**/components/**'],
				negative: ['lib/**/components/**'],
			},
		},
		{
			patterns: ['src/**/components', '!src/**/components'],
			expected: {
				positive: ['src/**/components/**'],
				negative: ['src/**/components/**'],
			},
		},
	];

	for (const {patterns, expected} of negativePatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, patterns, {cwd});

		// Find positive and negative patterns in results
		const positivePatterns = tasks[0].patterns.filter(p => !p.startsWith('!'));
		const negativePatterns = tasks[0].options.ignore;

		t.deepEqual(positivePatterns, expected.positive.filter(p => !p.startsWith('!')), `Positive patterns should be expanded correctly for ${patterns.join(', ')}`);

		// Check that negative patterns are properly handled in ignore array
		const expectedIgnore = new Set(expected.negative.map(p => p.replace(/^!/, '')));
		t.true(
			negativePatterns.some(p => expectedIgnore.has(p)),
			`Negative patterns should be in ignore array for ${patterns.join(', ')}`,
		);
	}
});

test('expandDirectories with multiple globstars', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'a', 'b', 'c', 'target'), {recursive: true});

	// Patterns with multiple globstars - should expand the last directory pattern
	const multiGlobstarPatterns = [
		{pattern: '**/a/**/target', expected: '**/a/**/target/**'},
		{pattern: '**/**/target', expected: '**/**/target/**'},
		{pattern: '**/target/**/nested', expected: '**/target/**/nested/**'},
	];

	for (const {pattern, expected} of multiGlobstarPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.deepEqual(tasks[0].patterns, [expected], `Multi-globstar pattern ${pattern} should expand to ${expected}`);
	}

	// Should NOT expand if last part isn't a simple directory
	const invalidMultiPatterns = [
		'**/a/**/*.js', // Ends with wildcard extension
		'**/a/**/b/c', // Has path after last globstar
		'**/a/**', // Ends with globstar
	];

	for (const pattern of invalidMultiPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const tasks = await runGenerateGlobTasks(t, [pattern], {cwd});
		t.deepEqual(tasks[0].patterns, [pattern], `Pattern ${pattern} should not be expanded`);
	}
});
