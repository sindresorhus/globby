import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';
import {toPath, isNegativePattern, genSync} from './utilities.js';

const ignoreFilesGlobOptions = {
	ignore: [
		'**/node_modules',
		'**/flow-typed',
		'**/coverage',
		'**/.git',
	],
	absolute: true,
	dot: true,
};

export const GITIGNORE_FILES_PATTERN = '**/.gitignore';

const applyBaseToPattern = (pattern, base) => isNegativePattern(pattern)
	? '!' + path.posix.join(base, pattern.slice(1))
	: path.posix.join(base, pattern);

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

	return fileOrDirectory;
};

const getIsIgnoredPredicate = (files, cwd) => {
	const patterns = files.flatMap(file => parseIgnoreFile(file, cwd));
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

const readFile = genSync({
	async: fs.promises.readFile,
	sync: fs.readFileSync,
});

const readFileContent = genSync(function * (filePath) {
	return {
		filePath,
		content: yield * readFile(filePath, 'utf8'),
	};
});

const fastGlobGenerator = genSync(fastGlob);

export const isIgnoredByIgnoreFiles = genSync(function * (patterns, options) {
	const {cwd} = normalizeOptions(options);

	const paths = yield * fastGlobGenerator(patterns, {cwd, ...ignoreFilesGlobOptions});

	const files = yield * genSync.all(paths.map(filePath => readFileContent(filePath)));

	return getIsIgnoredPredicate(files, cwd);
});

export const {
	async: isGitIgnored,
	sync: isGitIgnoredSync,
} = genSync(function * (options) {
	return yield * isIgnoredByIgnoreFiles(GITIGNORE_FILES_PATTERN, options);
});
