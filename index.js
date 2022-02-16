import fs from 'node:fs';
import nodePath from 'node:path';
import merge2 from 'merge2';
import fastGlob from 'fast-glob';
import dirGlobModule from 'dir-glob';
import {
	GITIGNORE_FILES_PATTERN,
	isIgnoredByIgnoreFiles,
} from './ignore.js';
import {FilterStream, toPath, isNegativePattern, genSync} from './utilities.js';

const fastGlobGenerator = genSync(fastGlob);
const dirGlob = genSync(dirGlobModule);

const assertPatternsInput = patterns => {
	if (patterns.some(pattern => typeof pattern !== 'string')) {
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

const getIgnoreFilesPatterns = options => {
	const {ignoreFiles, gitignore} = options;

	const patterns = ignoreFiles ? toPatternsArray(ignoreFiles) : [];
	if (gitignore) {
		patterns.push(GITIGNORE_FILES_PATTERN);
	}

	return patterns;
};

const getFilter = genSync(function * (options) {
	const ignoreFilesPatterns = getIgnoreFilesPatterns(options);
	const isIgnored = ignoreFilesPatterns.length > 0
		? yield * isIgnoredByIgnoreFiles(ignoreFilesPatterns, {cwd: options.cwd})
		: undefined;
	return createFilterFunction(isIgnored);
});

const createFilterFunction = isIgnored => {
	const seen = new Set();

	return fastGlobResult => {
		const path = fastGlobResult.path || fastGlobResult;
		const pathKey = nodePath.normalize(path);
		const seenOrIgnored = seen.has(pathKey) || (isIgnored && isIgnored(path));
		seen.add(pathKey);
		return !seenOrIgnored;
	};
};

const unionFastGlobResults = (results, filter) => results.flat().filter(fastGlobResult => filter(fastGlobResult));
const unionFastGlobStreams = (streams, filter) => merge2(streams).pipe(new FilterStream(fastGlobResult => filter(fastGlobResult)));

const convertNegativePatterns = (patterns, options) => {
	const tasks = [];

	while (patterns.length > 0) {
		const index = patterns.findIndex(pattern => isNegativePattern(pattern));

		if (index === -1) {
			tasks.push({patterns, options});
			break;
		}

		const ignorePattern = patterns[index].slice(1);

		for (const task of tasks) {
			task.options.ignore.push(ignorePattern);
		}

		if (index !== 0) {
			tasks.push({
				patterns: patterns.slice(0, index),
				options: {
					...options,
					ignore: [
						...options.ignore,
						ignorePattern,
					],
				},
			});
		}

		patterns = patterns.slice(index + 1);
	}

	return tasks;
};

const getDirGlobOptions = (options, cwd) => ({
	...(cwd ? {cwd} : {}),
	...(Array.isArray(options) ? {files: options} : options),
});

const expandTask = genSync(function * (task, expandOptions) {
	const [
		patterns,
		ignore,
	] = yield * genSync.all([
		dirGlob(task.patterns, expandOptions.patterns),
		dirGlob(task.options.ignore, expandOptions.ignore),
	]);

	return {
		patterns,
		options: {
			...task.options,
			ignore,
		},
	};
});

const generateTasks = genSync(function * (patterns, options) {
	const globTasks = convertNegativePatterns(patterns, options);

	const {cwd, expandDirectories} = options;

	if (!expandDirectories) {
		return globTasks;
	}

	const expandOptions = {
		patterns: getDirGlobOptions(expandDirectories, cwd),
		ignore: cwd ? {cwd} : undefined,
	};

	return yield * genSync.all(globTasks.map(task => expandTask(task, expandOptions)));
});

const globbyInternal = genSync(function * (patterns, options) {
	const [
		tasks,
		filter,
	] = yield * genSync.all([
		generateTasks(patterns, options),
		getFilter(options),
	]);

	const results = yield * genSync.all(
		tasks.map(task => fastGlobGenerator(task.patterns, task.options)),
	);

	return unionFastGlobResults(results, filter);
});

export const globbyStream = normalizeArgumentsSync((patterns, options) => {
	const tasks = generateTasks.sync(patterns, options);
	const filter = getFilter.sync(options);
	const streams = tasks.map(task => fastGlob.stream(task.patterns, task.options));

	return unionFastGlobStreams(streams, filter);
});

export const isDynamicPattern = normalizeArgumentsSync(
	(patterns, options) => patterns.some(pattern => fastGlob.isDynamicPattern(pattern, options)),
);

export const globby = normalizeArguments(globbyInternal.async);
export const globbySync = normalizeArgumentsSync(globbyInternal.sync);
export const generateGlobTasks = normalizeArguments(generateTasks.async);
export const generateGlobTasksSync = normalizeArgumentsSync(generateTasks.sync);

export {
	isGitIgnored,
	isGitIgnoredSync,
} from './ignore.js';
