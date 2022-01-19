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
	for (const cwdDirectory of getPathValues()) {
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
