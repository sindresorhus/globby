import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';
import gitIgnore from 'ignore';
import slash from 'slash';

const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/flow-typed/**',
	'**/coverage/**',
	'**/.git',
];

const readFileP = promisify(fs.readFile);

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

const getIsIgnoredPredicate = (ignores, cwd) => p => ignores.ignores(slash(path.relative(cwd, ensureAbsolutePathForCwd(cwd, p.path || p))));

const getFile = async (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = await readFileP(filePath, 'utf8');

	return {
		cwd,
		filePath,
		content,
	};
};

const getFileSync = (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = fs.readFileSync(filePath, 'utf8');

	return {
		cwd,
		filePath,
		content,
	};
};

const normalizeOptions = ({
	ignore = [],
	cwd = slash(process.cwd()),
} = {}) => ({ignore, cwd});

export const isGitIgnored = async options => {
	options = normalizeOptions(options);

	const paths = await fastGlob('**/.gitignore', {
		ignore: DEFAULT_IGNORE.concat(options.ignore),
		cwd: options.cwd,
	});

	const files = await Promise.all(paths.map(file => getFile(file, options.cwd)));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, options.cwd);
};

export const isGitIgnoredSync = options => {
	options = normalizeOptions(options);

	const paths = fastGlob.sync('**/.gitignore', {
		ignore: DEFAULT_IGNORE.concat(options.ignore),
		cwd: options.cwd,
	});

	const files = paths.map(file => getFileSync(file, options.cwd));
	const ignores = reduceIgnore(files);

	return getIsIgnoredPredicate(ignores, options.cwd);
};
