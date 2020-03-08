'use strict';
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const fastGlob = require('fast-glob');
const gitIgnore = require('ignore');
const slash = require('slash');
const findUp = require('find-up');
const findUpAll = require('find-up-all');

const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/flow-typed/**',
	'**/coverage/**',
	'**/.git'
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
	return files.reduce((ignores, file) => {
		ignores.add(parseGitIgnore(file.content, {
			cwd: file.cwd,
			fileName: file.filePath
		}));
		return ignores;
	}, gitIgnore());
};

const ensureAbsolutePathForCwd = (cwd, p) => {
	if (path.isAbsolute(p)) {
		if (p.startsWith(cwd)) {
			return p;
		}

		throw new Error(`Path ${p} is not in cwd ${cwd}`);
	}

	return path.join(cwd, p);
};

const getIsIgnoredPredecate = (ignores, gitRoot, cwd) => {
	return givenPath => {
		const pathWithCwd = ensureAbsolutePathForCwd(cwd, givenPath);
		const pathRelativeToGitRoot = path.relative(gitRoot, pathWithCwd);
		return ignores.ignores(slash(pathRelativeToGitRoot));
	};
};

const getFile = async (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = await readFileP(filePath, 'utf8');

	return {
		cwd,
		filePath,
		content
	};
};

const getFileSync = (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = fs.readFileSync(filePath, 'utf8');

	return {
		cwd,
		filePath,
		content
	};
};

const normalizeOptions = ({
	ignore = [],
	cwd = slash(process.cwd())
} = {}) => {
	return {ignore, cwd};
};

module.exports = async options => {
	options = normalizeOptions(options);
	const {cwd} = options;

	const gitDirectory = await findUp('.git', {cwd});
	const gitRoot = gitDirectory ? path.dirname(gitDirectory) : '';

	const gitIgnoreFilePaths = await Promise.all([
		findUpAll('.gitignore', {
			cwd: path.join(cwd, '..'),
			end: gitRoot
		}),
		fastGlob('**/.gitignore', {
			ignore: DEFAULT_IGNORE.concat(options.ignore),
			absolute: true,
			cwd
		})
	]);

	const gitIgnoreFileContents = await Promise.all(
		// TODO: Use .flat() once Node.js 12 is targetted
		[].concat(...gitIgnoreFilePaths)
			.map(p => path.relative(gitRoot, p))
			.map(file => getFile(file, gitRoot))
	);

	const ignores = reduceIgnore(gitIgnoreFileContents);
	return getIsIgnoredPredecate(ignores, gitRoot, cwd);
};

module.exports.sync = options => {
	options = normalizeOptions(options);
	const {cwd} = options;

	const gitDirectory = findUp.sync('.git', {cwd});
	const gitRoot = gitDirectory ? path.dirname(gitDirectory) : '';

	const gitIgnoreFilePaths = [
		...findUpAll.sync('.gitignore', {
			cwd: path.join(cwd, '..'),
			end: gitRoot
		}),
		...fastGlob.sync('**/.gitignore', {
			ignore: DEFAULT_IGNORE.concat(options.ignore),
			cwd
		}).map(p => path.join(cwd, p))
	];

	const gitIgnoreFileContents = gitIgnoreFilePaths
		.map(p => path.relative(gitRoot, p))
		.map(file => getFileSync(file, gitRoot));

	const ignores = reduceIgnore(gitIgnoreFileContents);
	return getIsIgnoredPredecate(ignores, gitRoot, cwd);
};
