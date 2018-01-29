'use strict';
const fs = require('fs');
const path = require('path');
const gitIgnore = require('ignore');
const multimatch = require('multimatch');
const pify = require('pify');
const slash = require('slash');

const readFileP = pify(fs.readFile);

const mapGitIgnorePatternTo = base => ignore => {
	if (ignore.startsWith('!')) {
		return '!' + path.posix.join(base, ignore.substr(1));
	}

	return path.posix.join(base, ignore);
};

const parseGitIgnore = (content, opts) => {
	const base = slash(path.relative(opts.cwd, path.dirname(opts.fileName)));

	return content
		.split(/\r?\n/)
		.filter(Boolean)
		.filter(l => l.charAt(0) !== '#')
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

const getIsIgnoredPredecate = (ignores, cwd) => {
	return p => ignores.ignores(slash(path.relative(cwd, p)));
};

const getFile = (file, cwd) => {
	const filePath = path.join(cwd, file);
	return readFileP(filePath, 'utf8')
		.then(content => ({
			content,
			cwd,
			filePath
		}));
};

const getFileSync = (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = fs.readFileSync(filePath, 'utf8');

	return {
		content,
		cwd,
		filePath
	};
};

const normalizeOpts = opts => {
	opts = opts || {};
	const ignore = opts.ignore || [];
	const cwd = opts.cwd || process.cwd();
	return {ignore, cwd};
};

const PASS_THROUGH = () => false;

module.exports = o => {
	const opts = normalizeOpts(o);
	const rootIgnore = path.join(opts.cwd, '.gitignore');

	if (opts.ignore.length > 0 && multimatch(rootIgnore, opts.ignore).length > 0) {
		return Promise.resolve(PASS_THROUGH);
	}

	if (!fs.existsSync(rootIgnore)) {
		return Promise.resolve(PASS_THROUGH);
	}

	return getFile('.gitignore', opts.cwd)
		.then(file => reduceIgnore([file]))
		.then(ignores => getIsIgnoredPredecate(ignores, opts.cwd));
};

module.exports.sync = o => {
	const opts = normalizeOpts(o);
	const rootIgnore = path.join(opts.cwd, '.gitignore');

	if (opts.ignore.length > 0 && multimatch(rootIgnore, opts.ignore).length > 0) {
		return PASS_THROUGH;
	}

	if (!fs.existsSync(rootIgnore)) {
		return PASS_THROUGH;
	}

	const file = getFileSync('.gitignore', opts.cwd);
	const ignores = reduceIgnore([file]);
	return getIsIgnoredPredecate(ignores, opts.cwd);
};
