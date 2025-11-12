import process from 'node:process';
import fs from 'node:fs';
import nodePath from 'node:path';
import {Readable} from 'node:stream';
import mergeStreams from '@sindresorhus/merge-streams';
import fastGlob from 'fast-glob';
import {toPath} from 'unicorn-magic';
import {
	GITIGNORE_FILES_PATTERN,
	getIgnorePatternsAndPredicate,
	getIgnorePatternsAndPredicateSync,
} from './ignore.js';
import {
	bindFsMethod,
	isNegativePattern,
	normalizeDirectoryPatternForFastGlob,
	adjustIgnorePatternsForParentDirectories,
} from './utilities.js';

const assertPatternsInput = patterns => {
	if (patterns.some(pattern => typeof pattern !== 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

const getStatMethod = fsImplementation =>
	bindFsMethod(fsImplementation?.promises, 'stat')
	?? bindFsMethod(fsImplementation, 'stat')
	?? bindFsMethod(fs.promises, 'stat');

const getStatSyncMethod = fsImplementation =>
	bindFsMethod(fsImplementation, 'statSync')
	?? bindFsMethod(fs, 'statSync');

const isDirectory = async (path, fsImplementation) => {
	try {
		const stats = await getStatMethod(fsImplementation)(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
};

const isDirectorySync = (path, fsImplementation) => {
	try {
		const stats = getStatSyncMethod(fsImplementation)(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
};

const normalizePathForDirectoryGlob = (filePath, cwd) => {
	const path = isNegativePattern(filePath) ? filePath.slice(1) : filePath;
	return nodePath.isAbsolute(path) ? path : nodePath.join(cwd, path);
};

const shouldExpandGlobstarDirectory = pattern => {
	const match = pattern?.match(/\*\*\/([^/]+)$/);
	if (!match) {
		return false;
	}

	const dirname = match[1];
	const hasWildcards = /[*?[\]{}]/.test(dirname);
	const hasExtension = nodePath.extname(dirname) && !dirname.startsWith('.');

	return !hasWildcards && !hasExtension;
};

const getDirectoryGlob = ({directoryPath, files, extensions}) => {
	const extensionGlob = extensions?.length > 0 ? `.${extensions.length > 1 ? `{${extensions.join(',')}}` : extensions[0]}` : '';
	return files
		? files.map(file => nodePath.posix.join(directoryPath, `**/${nodePath.extname(file) ? file : `${file}${extensionGlob}`}`))
		: [nodePath.posix.join(directoryPath, `**${extensionGlob ? `/*${extensionGlob}` : ''}`)];
};

const directoryToGlob = async (directoryPaths, {
	cwd = process.cwd(),
	files,
	extensions,
	fs: fsImplementation,
} = {}) => {
	const globs = await Promise.all(directoryPaths.map(async directoryPath => {
		// Check pattern without negative prefix
		const checkPattern = isNegativePattern(directoryPath) ? directoryPath.slice(1) : directoryPath;

		// Expand globstar directory patterns like **/dirname to **/dirname/**
		if (shouldExpandGlobstarDirectory(checkPattern)) {
			return getDirectoryGlob({directoryPath, files, extensions});
		}

		// Original logic for checking actual directories
		const pathToCheck = normalizePathForDirectoryGlob(directoryPath, cwd);
		return (await isDirectory(pathToCheck, fsImplementation)) ? getDirectoryGlob({directoryPath, files, extensions}) : directoryPath;
	}));

	return globs.flat();
};

const directoryToGlobSync = (directoryPaths, {
	cwd = process.cwd(),
	files,
	extensions,
	fs: fsImplementation,
} = {}) => directoryPaths.flatMap(directoryPath => {
	// Check pattern without negative prefix
	const checkPattern = isNegativePattern(directoryPath) ? directoryPath.slice(1) : directoryPath;

	// Expand globstar directory patterns like **/dirname to **/dirname/**
	if (shouldExpandGlobstarDirectory(checkPattern)) {
		return getDirectoryGlob({directoryPath, files, extensions});
	}

	// Original logic for checking actual directories
	const pathToCheck = normalizePathForDirectoryGlob(directoryPath, cwd);
	return isDirectorySync(pathToCheck, fsImplementation) ? getDirectoryGlob({directoryPath, files, extensions}) : directoryPath;
});

const toPatternsArray = patterns => {
	patterns = [...new Set([patterns].flat())];
	assertPatternsInput(patterns);
	return patterns;
};

const checkCwdOption = (cwd, fsImplementation = fs) => {
	if (!cwd || !fsImplementation.statSync) {
		return;
	}

	try {
		if (!fsImplementation.statSync(cwd).isDirectory()) {
			throw new Error('The `cwd` option must be a path to a directory');
		}
	} catch (error) {
		if (error.message === 'The `cwd` option must be a path to a directory') {
			throw error;
		}
	}
};

const normalizeOptions = (options = {}) => {
	options = {
		...options,
		ignore: options.ignore ?? [],
		expandDirectories: options.expandDirectories ?? true,
		cwd: toPath(options.cwd),
	};

	checkCwdOption(options.cwd, options.fs);

	return options;
};

const normalizeArguments = function_ => async (patterns, options) => function_(toPatternsArray(patterns), normalizeOptions(options));
const normalizeArgumentsSync = function_ => (patterns, options) => function_(toPatternsArray(patterns), normalizeOptions(options));

const getIgnoreFilesPatterns = options => {
	const {ignoreFiles, gitignore} = options;

	const patterns = ignoreFiles ? toPatternsArray(ignoreFiles) : [];
	if (gitignore) {
		patterns.push(GITIGNORE_FILES_PATTERN);
	}

	return patterns;
};

/**
Apply gitignore patterns to options and return filter predicate.

When negation patterns are present (e.g., '!important.log'), we cannot pass positive patterns to fast-glob because it would filter out files before our predicate can re-include them. In this case, we rely entirely on the predicate for filtering, which handles negations correctly.

When there are no negations, we optimize by passing patterns to fast-glob's ignore option to skip directories during traversal (performance optimization).

All patterns (including negated) are always used in the filter predicate to ensure correct Git-compatible behavior.

@returns {Promise<{options: Object, filter: Function}>}
*/
const applyIgnoreFilesAndGetFilter = async options => {
	const ignoreFilesPatterns = getIgnoreFilesPatterns(options);

	if (ignoreFilesPatterns.length === 0) {
		return {
			options,
			filter: createFilterFunction(false),
		};
	}

	// Read ignore files once and get both patterns and predicate
	const {patterns, predicate} = await getIgnorePatternsAndPredicate(ignoreFilesPatterns, options);

	// Determine which patterns are safe to pass to fast-glob
	// If there are negation patterns, we can't pass file patterns to fast-glob
	// because fast-glob doesn't understand negations and would filter out files
	// that should be re-included by negation patterns.
	// We only pass patterns to fast-glob if there are NO negations.
	const hasNegations = patterns.some(pattern => isNegativePattern(pattern));
	const patternsForFastGlob = hasNegations
		? [] // With negations, let the predicate handle everything
		: patterns
			.filter(pattern => !isNegativePattern(pattern))
			.map(pattern => normalizeDirectoryPatternForFastGlob(pattern));

	const modifiedOptions = {
		...options,
		ignore: [...options.ignore, ...patternsForFastGlob],
	};

	return {
		options: modifiedOptions,
		filter: createFilterFunction(predicate),
	};
};

/**
Apply gitignore patterns to options and return filter predicate (sync version).

@returns {{options: Object, filter: Function}}
*/
const applyIgnoreFilesAndGetFilterSync = options => {
	const ignoreFilesPatterns = getIgnoreFilesPatterns(options);

	if (ignoreFilesPatterns.length === 0) {
		return {
			options,
			filter: createFilterFunction(false),
		};
	}

	// Read ignore files once and get both patterns and predicate
	const {patterns, predicate} = getIgnorePatternsAndPredicateSync(ignoreFilesPatterns, options);

	// Determine which patterns are safe to pass to fast-glob
	// (same logic as async version - see comments above)
	const hasNegations = patterns.some(pattern => isNegativePattern(pattern));
	const patternsForFastGlob = hasNegations
		? []
		: patterns
			.filter(pattern => !isNegativePattern(pattern))
			.map(pattern => normalizeDirectoryPatternForFastGlob(pattern));

	const modifiedOptions = {
		...options,
		ignore: [...options.ignore, ...patternsForFastGlob],
	};

	return {
		options: modifiedOptions,
		filter: createFilterFunction(predicate),
	};
};

const createFilterFunction = isIgnored => {
	const seen = new Set();

	return fastGlobResult => {
		const pathKey = nodePath.normalize(fastGlobResult.path ?? fastGlobResult);

		if (seen.has(pathKey) || (isIgnored && isIgnored(pathKey))) {
			return false;
		}

		seen.add(pathKey);

		return true;
	};
};

const unionFastGlobResults = (results, filter) => results.flat().filter(fastGlobResult => filter(fastGlobResult));

const convertNegativePatterns = (patterns, options) => {
	// If all patterns are negative, prepend a positive catch-all pattern
	// This makes negation-only patterns work intuitively (e.g., '!*.json' matches all files except JSON)
	if (patterns.length > 0 && patterns.every(pattern => isNegativePattern(pattern))) {
		patterns = ['**/*', ...patterns];
	}

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

const applyParentDirectoryIgnoreAdjustments = tasks => tasks.map(task => ({
	patterns: task.patterns,
	options: {
		...task.options,
		ignore: adjustIgnorePatternsForParentDirectories(task.patterns, task.options.ignore),
	},
}));

const normalizeExpandDirectoriesOption = (options, cwd) => ({
	...(cwd ? {cwd} : {}),
	...(Array.isArray(options) ? {files: options} : options),
});

const generateTasks = async (patterns, options) => {
	const globTasks = convertNegativePatterns(patterns, options);

	const {cwd, expandDirectories, fs: fsImplementation} = options;

	if (!expandDirectories) {
		return applyParentDirectoryIgnoreAdjustments(globTasks);
	}

	const directoryToGlobOptions = {
		...normalizeExpandDirectoriesOption(expandDirectories, cwd),
		fs: fsImplementation,
	};

	return Promise.all(globTasks.map(async task => {
		let {patterns, options} = task;

		[
			patterns,
			options.ignore,
		] = await Promise.all([
			directoryToGlob(patterns, directoryToGlobOptions),
			directoryToGlob(options.ignore, {cwd, fs: fsImplementation}),
		]);

		// Adjust ignore patterns for parent directory references
		options.ignore = adjustIgnorePatternsForParentDirectories(patterns, options.ignore);

		return {patterns, options};
	}));
};

const generateTasksSync = (patterns, options) => {
	const globTasks = convertNegativePatterns(patterns, options);
	const {cwd, expandDirectories, fs: fsImplementation} = options;

	if (!expandDirectories) {
		return applyParentDirectoryIgnoreAdjustments(globTasks);
	}

	const directoryToGlobSyncOptions = {
		...normalizeExpandDirectoriesOption(expandDirectories, cwd),
		fs: fsImplementation,
	};

	return globTasks.map(task => {
		let {patterns, options} = task;
		patterns = directoryToGlobSync(patterns, directoryToGlobSyncOptions);
		options.ignore = directoryToGlobSync(options.ignore, {cwd, fs: fsImplementation});

		// Adjust ignore patterns for parent directory references
		options.ignore = adjustIgnorePatternsForParentDirectories(patterns, options.ignore);

		return {patterns, options};
	});
};

export const globby = normalizeArguments(async (patterns, options) => {
	// Apply ignore files and get filter (reads .gitignore files once)
	const {options: modifiedOptions, filter} = await applyIgnoreFilesAndGetFilter(options);

	// Generate tasks with modified options (includes gitignore patterns in ignore option)
	const tasks = await generateTasks(patterns, modifiedOptions);

	const results = await Promise.all(tasks.map(task => fastGlob(task.patterns, task.options)));
	return unionFastGlobResults(results, filter);
});

export const globbySync = normalizeArgumentsSync((patterns, options) => {
	// Apply ignore files and get filter (reads .gitignore files once)
	const {options: modifiedOptions, filter} = applyIgnoreFilesAndGetFilterSync(options);

	// Generate tasks with modified options (includes gitignore patterns in ignore option)
	const tasks = generateTasksSync(patterns, modifiedOptions);

	const results = tasks.map(task => fastGlob.sync(task.patterns, task.options));
	return unionFastGlobResults(results, filter);
});

export const globbyStream = normalizeArgumentsSync((patterns, options) => {
	// Apply ignore files and get filter (reads .gitignore files once)
	const {options: modifiedOptions, filter} = applyIgnoreFilesAndGetFilterSync(options);

	// Generate tasks with modified options (includes gitignore patterns in ignore option)
	const tasks = generateTasksSync(patterns, modifiedOptions);

	const streams = tasks.map(task => fastGlob.stream(task.patterns, task.options));

	if (streams.length === 0) {
		return Readable.from([]);
	}

	const stream = mergeStreams(streams).filter(fastGlobResult => filter(fastGlobResult));

	// Returning a web stream will require revisiting once Readable.toWeb integration is viable.
	// return Readable.toWeb(stream);

	return stream;
});

export const isDynamicPattern = normalizeArgumentsSync((patterns, options) => patterns.some(pattern => fastGlob.isDynamicPattern(pattern, options)));

export const generateGlobTasks = normalizeArguments(generateTasks);
export const generateGlobTasksSync = normalizeArgumentsSync(generateTasksSync);

export {
	isGitIgnored,
	isGitIgnoredSync,
	isIgnoredByIgnoreFiles,
	isIgnoredByIgnoreFilesSync,
} from './ignore.js';

export const {convertPathToPattern} = fastGlob;
