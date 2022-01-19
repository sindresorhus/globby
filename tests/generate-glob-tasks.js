import util from 'node:util';
import test from 'ava';
import {
	generateGlobTasks,
	generateGlobTasksSync,
} from '../index.js';
import {
	invalidPatterns,
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
}

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
