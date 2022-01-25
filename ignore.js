import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import ignore from 'ignore';
import slash from 'slash';
import {toPath, isNegativePattern} from './utilities.js';

const gitignoreGlobOptions = {
	ignore: [
		'**/node_modules',
		'**/flow-typed',
		'**/coverage',
		'**/.git',
	],
	absolute: true,
};

const applyBaseToPattern = (pattern, base) => isNegativePattern(pattern)
	? '!' + path.posix.join(base, pattern.slice(1))
	: path.posix.join(base, pattern);

const parseGitIgnoreFile = (file, cwd) => {
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

	return fileOrDirectory;
};

const getIsIgnoredPredicate = (files, cwd) => {
	const patterns = files.flatMap(file => parseGitIgnoreFile(file, cwd));
	const ignores = gitIgnore().add(patterns);

	return fileOrDirectory => {
		fileOrDirectory = toPath(fileOrDirectory);
		fileOrDirectory = toRelativePath(fileOrDirectory, cwd);
		return ignores.ignores(slash(fileOrDirectory));
	};
};

const normalizeOptions = (options = {}) => ({
	cwd: toPath(options.cwd) || process.cwd(),
});

export const isIgnored = async (pattern, options) => {
	const {cwd} = normalizeOptions(options);

	const paths = await fastGlob(pattern, {cwd, ...gitignoreGlobOptions});

	const files = await Promise.all(
		paths.map(async filePath => ({
			filePath,
			content: await fs.promises.readFile(filePath, 'utf8'),
		})),
	);

	return getIsIgnoredPredicate(files, cwd);
};

export const isIgnoredSync = (pattern, options) => {
	const {cwd} = normalizeOptions(options);

	const paths = fastGlob.sync(pattern, {cwd, ...gitignoreGlobOptions});

	const files = paths.map(filePath => ({
		filePath,
		content: fs.readFileSync(filePath, 'utf8'),
	}));

	return getIsIgnoredPredicate(files, cwd);
};
