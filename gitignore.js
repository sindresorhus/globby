import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';
import {toPath} from './utilities.js';

const DEFAULT_IGNORE = [
	'**/node_modules',
	'**/flow-typed',
	'**/coverage',
	'**/.git',
];

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

const normalizeOptions = ({
	ignore = [],
	cwd = slash(process.cwd()),
} = {}) => ({ignore: [...DEFAULT_IGNORE, ...ignore], cwd: toPath(cwd)});

const getGitignoreGlobOptions = options => ({
	...options,
	absolute: true,
});

export const isGitIgnored = async options => {
	options = normalizeOptions(options);

	const paths = await fastGlob('**/.gitignore', getGitignoreGlobOptions(options));

	const files = await Promise.all(paths.map(file => getFile(file, options.cwd)));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, options.cwd);
};

export const isGitIgnoredSync = options => {
	options = normalizeOptions(options);

	const paths = fastGlob.sync('**/.gitignore', getGitignoreGlobOptions(options));

	const files = paths.map(file => getFileSync(file, options.cwd));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, options.cwd);
};
