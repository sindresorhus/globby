import fs from 'node:fs';
import merge2 from 'merge2';
import fastGlob from 'fast-glob';
import dirGlob from 'dir-glob';
import toPath from './to-path.js';
import {isGitIgnored, isGitIgnoredSync} from './gitignore.js';
import {FilterStream} from './stream-utils.js';

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

export const generateGlobTasks = (patterns, taskOptions = {}) => {
	patterns = toPatternsArray(patterns);

	taskOptions = {
		ignore: [],
		expandDirectories: true,
		...taskOptions,
		cwd: toPath(taskOptions.cwd),
	};
	checkCwdOption(taskOptions);

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

const getPattern = (task, fn) => task.options.expandDirectories ? globDirectories(task, fn) : [task.pattern];

const globToTask = task => async glob => {
	const {options} = task;
	if (options.ignore && Array.isArray(options.ignore) && options.expandDirectories) {
		options.ignore = await dirGlob(options.ignore);
	}

	return {
		pattern: glob,
		options,
	};
};

const globToTaskSync = task => glob => {
	const {options} = task;
	if (options.ignore && Array.isArray(options.ignore) && options.expandDirectories) {
		options.ignore = dirGlob.sync(options.ignore);
	}

	return {
		pattern: glob,
		options,
	};
};

export const globby = async (patterns, options = {}) => {
	const globTasks = generateGlobTasks(patterns, options);

	const getTasks = async () => {
		const tasks = await Promise.all(globTasks.map(async task => {
			const globs = await getPattern(task, dirGlob);
			return Promise.all(globs.map(globToTask(task)));
		}));

		return tasks.flat();
	};

	const [filter, tasks] = await Promise.all([getFilter(options), getTasks()]);
	const results = await Promise.all(tasks.map(task => fastGlob(task.pattern, task.options)));

	return unionFastGlobResults(results, filter);
};

export const globbySync = (patterns, options = {}) => {
	const globTasks = generateGlobTasks(patterns, options);

	const tasks = globTasks.flatMap(
		task => getPattern(task, dirGlob.sync).map(globToTaskSync(task)),
	);

	const filter = getFilterSync(options);
	const results = tasks.map(task => fastGlob.sync(task.pattern, task.options));

	return unionFastGlobResults(results, filter);
};

export const globbyStream = (patterns, options = {}) => {
	const globTasks = generateGlobTasks(patterns, options);

	const tasks = globTasks.flatMap(
		task => getPattern(task, dirGlob.sync).map(globToTaskSync(task)),
	);

	const filter = getFilterSync(options);
	const streams = tasks.map(task => fastGlob.stream(task.pattern, task.options));

	return unionFastGlobStreams(streams, filter);
};

export const isDynamicPattern = (patterns, options = {}) => {
	patterns = toPatternsArray(patterns);
	options = {
		...options,
		cwd: toPath(options.cwd),
	};
	checkCwdOption(options);

	return patterns.some(pattern => fastGlob.isDynamicPattern(pattern, options));
};

export {
	isGitIgnored,
	isGitIgnoredSync,
} from './gitignore.js';
