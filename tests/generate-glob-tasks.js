import util from 'node:util';
import process from 'node:process';
import path from 'node:path';
import test from 'ava';
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
	const valueString = util.format(value);
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
		[],
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

		t.is(
			new Set(allPatterns).size,
			positivePatterns.length,
			`positive patterns should be in patterns: ${patternsToDebug}`,
		);

		t.is(
			new Set(allIgnore).size,
			negativePatterns.length - negativePatternsAtStart.length,
			`negative patterns should be in ignore: ${patternsToDebug}`,
		);
	}
});
