import process from 'node:process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';
import {toPath} from 'unicorn-magic';
import {isNegativePattern, bindFsMethod} from './utilities.js';

const defaultIgnoredDirectories = [
	'**/node_modules',
	'**/flow-typed',
	'**/coverage',
	'**/.git',
];
const ignoreFilesGlobOptions = {
	absolute: true,
	dot: true,
};

export const GITIGNORE_FILES_PATTERN = '**/.gitignore';

const getReadFileMethod = fsImplementation =>
	bindFsMethod(fsImplementation?.promises, 'readFile')
	?? bindFsMethod(fsImplementation, 'readFile')
	?? bindFsMethod(fsPromises, 'readFile');

const getReadFileSyncMethod = fsImplementation =>
	bindFsMethod(fsImplementation, 'readFileSync')
	?? bindFsMethod(fs, 'readFileSync');

// Apply base path to gitignore patterns based on .gitignore spec 2.22.1
// https://git-scm.com/docs/gitignore#_pattern_format
// See also https://github.com/sindresorhus/globby/issues/146
const applyBaseToPattern = (pattern, base) => {
	if (!base) {
		return pattern;
	}

	const isNegative = isNegativePattern(pattern);
	const cleanPattern = isNegative ? pattern.slice(1) : pattern;

	// Check if pattern has non-trailing slashes
	const slashIndex = cleanPattern.indexOf('/');
	const hasNonTrailingSlash = slashIndex !== -1 && slashIndex !== cleanPattern.length - 1;

	let result;
	if (!hasNonTrailingSlash) {
		// "If there is no separator at the beginning or middle of the pattern,
		// then the pattern may also match at any level below the .gitignore level."
		// So patterns like '*.log' or 'temp' or 'build/' (trailing slash) match recursively.
		result = path.posix.join(base, '**', cleanPattern);
	} else if (cleanPattern.startsWith('/')) {
		// "If there is a separator at the beginning [...] of the pattern,
		// then the pattern is relative to the directory level of the particular .gitignore file itself."
		// Leading slash anchors the pattern to the .gitignore's directory.
		result = path.posix.join(base, cleanPattern.slice(1));
	} else {
		// "If there is a separator [...] middle [...] of the pattern,
		// then the pattern is relative to the directory level of the particular .gitignore file itself."
		// Patterns like 'src/foo' are relative to the .gitignore's directory.
		result = path.posix.join(base, cleanPattern);
	}

	return isNegative ? '!' + result : result;
};

const parseIgnoreFile = (file, cwd) => {
	const base = slash(path.relative(cwd, path.dirname(file.filePath)));

	return file.content
		.split(/\r?\n/)
		.filter(line => line && !line.startsWith('#'))
		.map(pattern => applyBaseToPattern(pattern, base));
};

const toRelativePath = (fileOrDirectory, cwd) => {
	cwd = slash(cwd);
	if (path.isAbsolute(fileOrDirectory)) {
		if (slash(fileOrDirectory).startsWith(cwd)) {
			return path.relative(cwd, fileOrDirectory);
		}

		throw new Error(`Path ${fileOrDirectory} is not in cwd ${cwd}`);
	}

	// Normalize relative paths:
	// - Git treats './foo' as 'foo' when checking against patterns
	// - Patterns starting with './' in .gitignore are invalid and don't match anything
	// - The ignore library expects normalized paths without './' prefix
	if (fileOrDirectory.startsWith('./')) {
		return fileOrDirectory.slice(2);
	}

	// Paths with ../ point outside cwd and cannot match patterns from this directory
	// Return undefined to indicate this path is outside scope
	if (fileOrDirectory.startsWith('../')) {
		return undefined;
	}

	return fileOrDirectory;
};

const getIsIgnoredPredicate = (files, cwd) => {
	const patterns = files.flatMap(file => parseIgnoreFile(file, cwd));
	const ignores = gitIgnore().add(patterns);

	return fileOrDirectory => {
		fileOrDirectory = toPath(fileOrDirectory);
		fileOrDirectory = toRelativePath(fileOrDirectory, cwd);
		// If path is outside cwd (undefined), it can't be ignored by patterns in cwd
		if (fileOrDirectory === undefined) {
			return false;
		}

		return fileOrDirectory ? ignores.ignores(slash(fileOrDirectory)) : false;
	};
};

const normalizeOptions = (options = {}) => {
	const ignoreOption = options.ignore
		? (Array.isArray(options.ignore) ? options.ignore : [options.ignore])
		: [];

	const cwd = toPath(options.cwd) ?? process.cwd();

	// Adjust deep option for fast-glob: fast-glob's deep counts differently than expected
	// User's deep: 0 = root only -> fast-glob needs: 1
	// User's deep: 1 = root + 1 level -> fast-glob needs: 2
	const deep = typeof options.deep === 'number' ? Math.max(0, options.deep) + 1 : Number.POSITIVE_INFINITY;

	// Only pass through specific fast-glob options that make sense for finding ignore files
	return {
		cwd,
		suppressErrors: options.suppressErrors ?? false,
		deep,
		ignore: [...ignoreOption, ...defaultIgnoredDirectories],
		followSymbolicLinks: options.followSymbolicLinks ?? true,
		concurrency: options.concurrency,
		throwErrorOnBrokenSymbolicLink: options.throwErrorOnBrokenSymbolicLink ?? false,
		fs: options.fs,
	};
};

export const isIgnoredByIgnoreFiles = async (patterns, options) => {
	const normalizedOptions = normalizeOptions(options);

	const paths = await fastGlob(patterns, {
		...normalizedOptions,
		...ignoreFilesGlobOptions, // Must be last to ensure absolute and dot are always set
	});

	const readFileMethod = getReadFileMethod(normalizedOptions.fs);
	const files = await Promise.all(paths.map(async filePath => ({
		filePath,
		content: await readFileMethod(filePath, 'utf8'),
	})));

	return getIsIgnoredPredicate(files, normalizedOptions.cwd);
};

export const isIgnoredByIgnoreFilesSync = (patterns, options) => {
	const normalizedOptions = normalizeOptions(options);

	const paths = fastGlob.sync(patterns, {
		...normalizedOptions,
		...ignoreFilesGlobOptions, // Must be last to ensure absolute and dot are always set
	});

	const readFileSyncMethod = getReadFileSyncMethod(normalizedOptions.fs);
	const files = paths.map(filePath => ({
		filePath,
		content: readFileSyncMethod(filePath, 'utf8'),
	}));

	return getIsIgnoredPredicate(files, normalizedOptions.cwd);
};

const getPatternsFromIgnoreFiles = (files, cwd) => files.flatMap(file => parseIgnoreFile(file, cwd));

/**
Read ignore files and return both patterns and predicate.
This avoids reading the same files twice (once for patterns, once for filtering).

@returns {Promise<{patterns: string[], predicate: Function}>}
*/
export const getIgnorePatternsAndPredicate = async (patterns, options) => {
	const normalizedOptions = normalizeOptions(options);

	const paths = await fastGlob(patterns, {
		...normalizedOptions,
		...ignoreFilesGlobOptions, // Must be last to ensure absolute and dot are always set
	});

	const readFileMethod = getReadFileMethod(normalizedOptions.fs);
	const files = await Promise.all(paths.map(async filePath => ({
		filePath,
		content: await readFileMethod(filePath, 'utf8'),
	})));

	return {
		patterns: getPatternsFromIgnoreFiles(files, normalizedOptions.cwd),
		predicate: getIsIgnoredPredicate(files, normalizedOptions.cwd),
	};
};

/**
Read ignore files and return both patterns and predicate (sync version).

@returns {{patterns: string[], predicate: Function}}
*/
export const getIgnorePatternsAndPredicateSync = (patterns, options) => {
	const normalizedOptions = normalizeOptions(options);

	const paths = fastGlob.sync(patterns, {
		...normalizedOptions,
		...ignoreFilesGlobOptions, // Must be last to ensure absolute and dot are always set
	});

	const readFileSyncMethod = getReadFileSyncMethod(normalizedOptions.fs);
	const files = paths.map(filePath => ({
		filePath,
		content: readFileSyncMethod(filePath, 'utf8'),
	}));

	return {
		patterns: getPatternsFromIgnoreFiles(files, normalizedOptions.cwd),
		predicate: getIsIgnoredPredicate(files, normalizedOptions.cwd),
	};
};

export const isGitIgnored = options => isIgnoredByIgnoreFiles(GITIGNORE_FILES_PATTERN, options);
export const isGitIgnoredSync = options => isIgnoredByIgnoreFilesSync(GITIGNORE_FILES_PATTERN, options);
