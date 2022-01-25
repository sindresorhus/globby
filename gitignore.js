import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
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

const toRelativePath = (cwd, fileOrDirectory) => {
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
		fileOrDirectory = toRelativePath(cwd, fileOrDirectory);
		return ignores.ignores(slash(fileOrDirectory));
	};
};

const normalizeOptions = (options = {}) => ({
	cwd: toPath(options.cwd) || slash(process.cwd()),
});

export const isGitIgnored = async options => {
	const {cwd} = normalizeOptions(options);

	const paths = await fastGlob('**/.gitignore', {cwd, ...gitignoreGlobOptions});

	const files = await Promise.all(
		paths.map(async filePath => ({
			filePath,
			content: await fs.promises.readFile(filePath, 'utf8'),
		})),
	);

	return getIsIgnoredPredicate(files, cwd);
};

export const isGitIgnoredSync = options => {
	const {cwd} = normalizeOptions(options);

	const paths = fastGlob.sync('**/.gitignore', {cwd, ...gitignoreGlobOptions});

	const files = paths.map(filePath => ({
		filePath,
		content: fs.readFileSync(filePath, 'utf8'),
	}));

	return getIsIgnoredPredicate(files, cwd);
};
