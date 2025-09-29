import process from 'node:process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';
import {toPath} from 'unicorn-magic';
import {isNegativePattern} from './utilities.js';

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

const normalizeOptions = (options = {}) => ({
	cwd: toPath(options.cwd) ?? process.cwd(),
	suppressErrors: Boolean(options.suppressErrors),
	deep: typeof options.deep === 'number' ? options.deep : Number.POSITIVE_INFINITY,
	ignore: [...options.ignore ?? [], ...defaultIgnoredDirectories],
});

export const isIgnoredByIgnoreFiles = async (patterns, options) => {
	const {cwd, suppressErrors, deep, ignore} = normalizeOptions(options);

	const paths = await fastGlob(patterns, {
		cwd,
		suppressErrors,
		deep,
		ignore,
		...ignoreFilesGlobOptions,
	});

	const files = await Promise.all(paths.map(async filePath => ({
		filePath,
		content: await fsPromises.readFile(filePath, 'utf8'),
	})));

	return getIsIgnoredPredicate(files, cwd);
};

export const isIgnoredByIgnoreFilesSync = (patterns, options) => {
	const {cwd, suppressErrors, deep, ignore} = normalizeOptions(options);

	const paths = fastGlob.sync(patterns, {
		cwd,
		suppressErrors,
		deep,
		ignore,
		...ignoreFilesGlobOptions,
	});

	const files = paths.map(filePath => ({
		filePath,
		content: fs.readFileSync(filePath, 'utf8'),
	}));

	return getIsIgnoredPredicate(files, cwd);
};

export const isGitIgnored = options => isIgnoredByIgnoreFiles(GITIGNORE_FILES_PATTERN, options);
export const isGitIgnoredSync = options => isIgnoredByIgnoreFilesSync(GITIGNORE_FILES_PATTERN, options);
