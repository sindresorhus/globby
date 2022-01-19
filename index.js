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

const normalizeArguments = fn => async (patterns, options) => fn(toPatternsArray(patterns), normalizeOptions(options));
const normalizeArgumentsSync = fn => (patterns, options) => fn(toPatternsArray(patterns), normalizeOptions(options));

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

const getPatternsAndIgnore = (allPatterns, start, index) => ({
	patterns: allPatterns
		.slice(Math.max(start, 0), index)
		.filter(({negated}) => !negated)
		.map(({pattern}) => pattern),
	ignore: allPatterns
		.slice(index)
		.filter(({negated}) => negated)
		.map(({pattern}) => pattern)
});

const convertNegativePatterns = (patterns, options) => {
	const allPatterns = patterns.map((pattern, index) => {
		const negated = isNegative(pattern);

		if (negated) {
			pattern = pattern.slice(1);
		}

		return {negated, pattern, index};
	});

	const tasks = [];

	let lastNegativeIndex = -1;
	for (const {negated, pattern, index} of allPatterns) {
		if (!negated) {
			continue;
		}

		tasks.push(getPatternsAndIgnore(allPatterns, lastNegativeIndex, index))
		lastNegativeIndex = index;
	}

	if (lastNegativeIndex !== allPatterns.length - 1) {
		tasks.push(getPatternsAndIgnore(allPatterns, lastNegativeIndex, allPatterns.length))
	}

	return tasks
		.filter(({patterns}) => patterns.length !== 0)
		.map(({patterns, ignore}) => ({
			patterns,
			options: {
				...options,
				ignore: [...options.ignore, ...ignore],
			}
		}));
};

const getDirGlobOptions = (options, cwd) => ({
	...(cwd ? {cwd} : {}),
	...(Array.isArray(options) ? {files: options} : options),
});

const generateTasks = async (patterns, options) => {
	const globTasks = convertNegativePatterns(patterns, options);

	const {cwd, expandDirectories} = options;

	if (!expandDirectories) {
		return globTasks;
	}

	const patternExpandOptions = getDirGlobOptions(expandDirectories, cwd);
	const ignoreExpandOptions = cwd ? {cwd} : undefined;

	return Promise.all(
		globTasks.map(async task => {
			let {patterns, options} = task;

			[
				patterns,
				options.ignore,
			] = await Promise.all([
				dirGlob(patterns, patternExpandOptions),
				dirGlob(options.ignore, ignoreExpandOptions),
			]);

			return {patterns, options};
		}),
	);
};

const generateTasksSync = (patterns, options) => {
	const globTasks = convertNegativePatterns(patterns, options);

	const {cwd, expandDirectories} = options;

	if (!expandDirectories) {
		return globTasks;
	}

	const patternExpandOptions = getDirGlobOptions(expandDirectories, cwd);
	const ignoreExpandOptions = cwd ? {cwd} : undefined;

	return globTasks.map(task => {
		let {patterns, options} = task;
		patterns = dirGlob.sync(patterns, patternExpandOptions);
		options.ignore = dirGlob.sync(options.ignore, ignoreExpandOptions);
		return {patterns, options};
	});
};

export const globby = normalizeArguments(async (patterns, options) => {
	const [
		tasks,
		filter,
	] = await Promise.all([
		generateTasks(patterns, options),
		getFilter(options),
	]);
	const results = await Promise.all(tasks.map(task => fastGlob(task.patterns, task.options)));

	return unionFastGlobResults(results, filter);
});

export const globbySync = normalizeArgumentsSync((patterns, options) => {
	const tasks = generateTasksSync(patterns, options);
	const filter = getFilterSync(options);
	const results = tasks.map(task => fastGlob.sync(task.patterns, task.options));

	return unionFastGlobResults(results, filter);
});

export const globbyStream = normalizeArgumentsSync((patterns, options) => {
	const tasks = generateTasksSync(patterns, options);
	const filter = getFilterSync(options);
	const streams = tasks.map(task => fastGlob.stream(task.patterns, task.options));

	return unionFastGlobStreams(streams, filter);
});

export const isDynamicPattern = normalizeArgumentsSync(
	(patterns, options) => patterns.some(pattern => fastGlob.isDynamicPattern(pattern, options)),
);

export const generateGlobTasks = normalizeArguments(generateTasks);
export const generateGlobTasksSync = normalizeArgumentsSync(generateTasksSync);

export {
	isGitIgnored,
	isGitIgnoredSync,
} from './gitignore.js';
