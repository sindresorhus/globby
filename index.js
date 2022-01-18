import fs from 'node:fs';
import merge2 from 'merge2';
import fastGlob from 'fast-glob';
import dirGlob from 'dir-glob';
import {isGitIgnored, isGitIgnoredSync} from './gitignore.js';
import {FilterStream, toPath} from './utilities.js';

const isNegative = pattern => pattern[0] === '!';

const assertPatternsInput = patterns => {
	if (!patterns.every(pattern => typeof pattern === 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

const toPatternsArray = patterns => {
	patterns = [...new Set([patterns].flat())];
	assertPatternsInput(patterns);
	return patterns;
};

const checkCwdOption = options => {
	if (!options.cwd) {
		return;
	}

	let stat;
	try {
		stat = fs.statSync(options.cwd);
	} catch {
		return;
	}

	if (!stat.isDirectory()) {
		throw new Error('The `cwd` option must be a path to a directory');
	}
};

const normalizeOptions = (options = {}) => {
	options = {
		ignore: [],
		expandDirectories: true,
		...options,
		cwd: toPath(options.cwd),
	};

	checkCwdOption(options);

	return options;
};

const getFilter = async options => createFilterFunction(
	options.gitignore && await isGitIgnored({cwd: options.cwd, ignore: options.ignore}),
);
const getFilterSync = options => createFilterFunction(
	options.gitignore && isGitIgnoredSync({cwd: options.cwd, ignore: options.ignore}),
);
const createFilterFunction = isIgnored => {
	const seen = new Set();

	return fastGlobResult => {
		const path = fastGlobResult.path || fastGlobResult;
		const seenOrIgnored = seen.has(path) || (isIgnored && isIgnored(path));
		seen.add(path);
		return !seenOrIgnored;
	};
};

const unionFastGlobResults = (results, filter) => results.flat().filter(fastGlobResult => filter(fastGlobResult));
const unionFastGlobStreams = (streams, filter) => merge2(streams).pipe(new FilterStream(fastGlobResult => filter(fastGlobResult)));

export const generateGlobTasks = (patterns, taskOptions) => {
	patterns = toPatternsArray(patterns);
	taskOptions = normalizeOptions(taskOptions);

	const globTasks = [];
	for (const [index, pattern] of patterns.entries()) {
		if (isNegative(pattern)) {
			continue;
		}

		const ignore = patterns
			.slice(index)
			.filter(pattern => isNegative(pattern))
			.map(pattern => pattern.slice(1));

		const options = {
			...taskOptions,
			ignore: [...taskOptions.ignore, ...ignore],
		};

		globTasks.push({pattern, options});
	}

	return globTasks;
};

const globDirectories = (task, fn) => {
	let options = {};
	if (task.options.cwd) {
		options.cwd = task.options.cwd;
	}

	if (Array.isArray(task.options.expandDirectories)) {
		options = {
			...options,
			files: task.options.expandDirectories,
		};
	} else if (typeof task.options.expandDirectories === 'object') {
		options = {
			...options,
			...task.options.expandDirectories,
		};
	}

	return fn(task.pattern, options);
};

const expendTasks = async (tasks, options) => {
	if (!options.expandDirectories) {
		return tasks;
	}

	tasks = await Promise.all(
		tasks.map(async task => {
			const {options} = task;

			const [
				patterns,
				ignore,
			] = await Promise.all([
				globDirectories(task, dirGlob),
				dirGlob(options.ignore),
			]);

			options.ignore = ignore;
			return patterns.map(pattern => ({pattern, options}));
		}),
	);

	return tasks.flat();
};

const expandTasksSync = (tasks, options) =>
	options.expandDirectories
		? tasks.flatMap(task => {
			const {options} = task;
			const patterns = globDirectories(task, dirGlob.sync);
			options.ignore = dirGlob.sync(options.ignore);
			return patterns.map(pattern => ({pattern, options}));
		})
		: tasks;

export const globby = async (patterns, options) => {
	const globTasks = generateGlobTasks(patterns, options);

	options = normalizeOptions(options);
	const [
		filter,
		tasks,
	] = await Promise.all([
		getFilter(options),
		expendTasks(globTasks, options),
	]);
	const results = await Promise.all(tasks.map(task => fastGlob(task.pattern, task.options)));

	return unionFastGlobResults(results, filter);
};

export const globbySync = (patterns, options) => {
	const globTasks = generateGlobTasks(patterns, options);

	options = normalizeOptions(options);
	const tasks = expandTasksSync(globTasks, options);

	const filter = getFilterSync(options);
	const results = tasks.map(task => fastGlob.sync(task.pattern, task.options));

	return unionFastGlobResults(results, filter);
};

export const globbyStream = (patterns, options) => {
	const globTasks = generateGlobTasks(patterns, options);

	options = normalizeOptions(options);
	const tasks = expandTasksSync(globTasks, options);

	const filter = getFilterSync(options);
	const streams = tasks.map(task => fastGlob.stream(task.pattern, task.options));

	return unionFastGlobStreams(streams, filter);
};

export const isDynamicPattern = (patterns, options) => {
	patterns = toPatternsArray(patterns);
	options = normalizeOptions(options);

	return patterns.some(pattern => fastGlob.isDynamicPattern(pattern, options));
};

export {
	isGitIgnored,
	isGitIgnoredSync,
} from './gitignore.js';
