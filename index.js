import fs from 'node:fs';
import merge2 from 'merge2';
import fastGlob from 'fast-glob';
import dirGlob from 'dir-glob';
import toPath from './to-path.js';
import {isGitIgnored, isGitIgnoredSync} from './gitignore.js';
import {FilterStream, UniqueStream} from './stream-utils.js';

const DEFAULT_FILTER = () => false;

const isNegative = pattern => pattern[0] === '!';

const assertPatternsInput = patterns => {
	if (!patterns.every(pattern => typeof pattern === 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
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

const getPathString = fastGlobResult => fastGlobResult.path || fastGlobResult;
const unionFastGlobResults = (results, filter) => {
	const seen = new Set();

	return results.flat().filter(fastGlobResult => {
		if (filter(fastGlobResult)) {
			return false;
		}

		const value = getPathString(fastGlobResult);
		if (seen.has(value)) {
			return false;
		}

		seen.add(value);

		return true;
	});
};

export const generateGlobTasks = (patterns, taskOptions = {}) => {
	patterns = [...new Set([patterns].flat())];
	assertPatternsInput(patterns);

	const globTasks = [];

	taskOptions = {
		ignore: [],
		expandDirectories: true,
		...taskOptions,
		cwd: toPath(taskOptions.cwd),
	};

	checkCwdOption(taskOptions);

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

const getFilter = async options => {
	if (!options.gitignore) {
		return DEFAULT_FILTER;
	}

	const filter = await isGitIgnored({cwd: options.cwd, ignore: options.ignore});
	return fastGlobResult => filter(getPathString(fastGlobResult));
};

const getFilterSync = options => {
	if (!options.gitignore) {
		return DEFAULT_FILTER;
	}

	const filter = isGitIgnoredSync({cwd: options.cwd, ignore: options.ignore});
	return fastGlobResult => filter(getPathString(fastGlobResult));
};

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
	const filterStream = new FilterStream(fastGlobResult => !filter(fastGlobResult));
	const uniqueStream = new UniqueStream(fastGlobResult => getPathString(fastGlobResult));

	return merge2(tasks.map(task => fastGlob.stream(task.pattern, task.options)))
		.pipe(filterStream)
		.pipe(uniqueStream);
};

export const isDynamicPattern = (patterns, options = {}) => {
	options = {
		...options,
		cwd: toPath(options.cwd),
	};

	return [patterns].flat().some(pattern => fastGlob.isDynamicPattern(pattern, options));
};

export {
	isGitIgnored,
	isGitIgnoredSync,
} from './gitignore.js';
