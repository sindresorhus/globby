import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';
import {toPath} from './utilities.js';

const gitignoreGlobOptions = {
	ignore: [
		'**/node_modules',
		'**/flow-typed',
		'**/coverage',
		'**/.git',
	],
	absolute: true,
};

const mapGitIgnorePatternTo = base => ignore => {
	if (ignore.startsWith('!')) {
		return '!' + path.posix.join(base, ignore.slice(1));
	}

	return path.posix.join(base, ignore);
};

const parseGitIgnore = (content, options) => {
	const base = slash(path.relative(options.cwd, path.dirname(options.fileName)));

	return content
		.split(/\r?\n/)
		.filter(Boolean)
		.filter(line => !line.startsWith('#'))
		.map(mapGitIgnorePatternTo(base));
};

const reduceIgnore = files => {
	const ignores = gitIgnore();
	for (const file of files) {
		ignores.add(parseGitIgnore(file.content, {
			cwd: file.cwd,
			fileName: file.filePath,
		}));
	}

	return ignores;
};

const ensureAbsolutePathForCwd = (cwd, p) => {
	cwd = slash(cwd);
	if (path.isAbsolute(p)) {
		if (slash(p).startsWith(cwd)) {
			return p;
		}

		throw new Error(`Path ${p} is not in cwd ${cwd}`);
	}

	return path.join(cwd, p);
};

const getIsIgnoredPredicate = (ignores, cwd) => p => ignores.ignores(slash(path.relative(cwd, ensureAbsolutePathForCwd(cwd, toPath(p)))));

const getFile = async (filePath, cwd) => ({
	cwd,
	filePath,
	content: await fs.promises.readFile(filePath, 'utf8'),
});

const getFileSync = (filePath, cwd) => ({
	cwd,
	filePath,
	content: fs.readFileSync(filePath, 'utf8'),
});

const normalizeOptions = (options = {}) => ({
	cwd: toPath(options.cwd) || slash(process.cwd()),
});

export const isGitIgnored = async options => {
	const {cwd} = normalizeOptions(options);

	const paths = await fastGlob('**/.gitignore', {cwd, ...gitignoreGlobOptions});

	const files = await Promise.all(paths.map(file => getFile(file, cwd)));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, cwd);
};

export const isGitIgnoredSync = options => {
	const {cwd} = normalizeOptions(options);

	const paths = fastGlob.sync('**/.gitignore', {cwd, ...gitignoreGlobOptions});

	const files = paths.map(file => getFileSync(file, cwd));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, cwd);
};
