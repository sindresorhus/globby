'use strict';
const path = require('path');
const fs = require('fs');
const arrayUnion = require('array-union');
const fg = require('fast-glob');
const glob = require('glob');
const pify = require('pify');
const dirGlob = require('dir-glob');

const readFileP = pify(fs.readFile);

const isNegative = pattern => pattern[0] === '!';
const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/bower_components/**',
	'**/flow-typed/**',
	'**/coverage/**',
	'**/.git'
];

const assertPatternsInput = patterns => {
	if (!patterns.every(x => typeof x === 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

const generateGlobTasks = (patterns, taskOpts) => {
	const globTasks = [];

	taskOpts = Object.assign({
		cache: Object.create(null),
		statCache: Object.create(null),
		realpathCache: Object.create(null),
		symlinks: Object.create(null),
		ignore: [],
		expandDirectories: true,
		onlyFiles: true
	}, taskOpts);

	patterns.forEach((pattern, i) => {
		if (isNegative(pattern)) {
			return;
		}

		const ignore = patterns
			.slice(i)
			.filter(isNegative)
			.map(pattern => pattern.slice(1));

		const opts = Object.assign({}, taskOpts, {
			ignore: taskOpts.ignore.concat(ignore)
		});

		globTasks.push({pattern, opts});
	});

	return globTasks;
};

const globDirs = (task, fn) => {
	if (Array.isArray(task.opts.expandDirectories)) {
		return fn(task.pattern, {files: task.opts.expandDirectories});
	}

	if (typeof task.opts.expandDirectories === 'object') {
		return fn(task.pattern, task.opts.expandDirectories);
	}

	return fn(task.pattern);
};

const getPattern = (task, fn) => task.opts.expandDirectories ? globDirs(task, fn) : [task.pattern];

const gitignoreToGlob = (filePath, gitignore) => gitignore.split('\n')
	.filter(pattern => Boolean(pattern) && pattern[0] !== '#')
	.reduce((ignores, pattern) => {
		const negative = isNegative(pattern);
		if (pattern[0] === '/') {
			ignores.push(path.join(path.dirname(filePath), pattern.substring(1)));
			ignores.push(path.join(path.dirname(filePath), pattern.substring(1), '**'));
		} else {
			ignores.push(`${negative ? '!' : ''}${path.join(path.dirname(filePath), '**', negative ? pattern.substring(1) : pattern)}`);
			ignores.push(`${negative ? '!' : ''}${path.join(path.dirname(filePath), '**', negative ? pattern.substring(1) : pattern, '**')}`);
		}
		return ignores;
	}, []);

const gitignorePatternsSync = opts =>
	// Add default ignores. See https://github.com/mrmlnc/fast-glob/issues/42
	fg.sync('**/.gitignore', {ignore: opts.ignore.concat(DEFAULT_IGNORE), cwd: opts.cwd})
	.reduce((ignores, filePath) => {
		return ignores.concat(gitignoreToGlob(filePath, fs.readFileSync(path.join(opts.cwd, filePath), 'utf8')));
	}, []);

const gitignorePatterns = opts =>
	// Add default ignores. See https://github.com/mrmlnc/fast-glob/issues/42
	fg('**/.gitignore', {ignore: opts.ignore.concat(DEFAULT_IGNORE), cwd: opts.cwd})
	.then(filePaths => Promise.all(filePaths.map(filePath =>
		readFileP(path.join(opts.cwd, filePath), 'utf8').then(content => ({content, filePath}))
	)))
	.then(file => file.reduce((ignores, file) => ignores.concat(gitignoreToGlob(file.filePath, file.content)), []));

const invertGlob = pattern => pattern[0] === '!' ? pattern.substring(1) : `!${pattern}`;

module.exports = (patterns, opts) => {
	patterns = [].concat(patterns);
	try {
		assertPatternsInput(patterns);
	} catch (err) {
		return Promise.reject(err);
	}

	const options = Object.assign({cwd: process.cwd(), ignore: []}, opts);

	return Promise.resolve(opts && opts.gitignore ? gitignorePatterns(options) : [])
	.then(gitignore => {
		patterns = patterns.concat(options.ignore.concat(gitignore).map(invertGlob));
		options.ignore = [];
		return generateGlobTasks(patterns, options);
	}).then(globTasks => Promise.all(globTasks.map(task => Promise.resolve(getPattern(task, dirGlob))
			.then(globs => Promise.all(globs.map(glob => ({pattern: glob, opts: task.opts}))))
	)))
		.then(tasks => arrayUnion.apply(null, tasks))
		.then(tasks => Promise.all(tasks.map(task => fg(task.pattern, task.opts))))
		.then(paths => arrayUnion.apply(null, paths))
		// TODO Remove trailing `/`, remove this workaround when https://github.com/mrmlnc/fast-glob/issues/46 is fixed
		.then(paths => paths.map(p => p.replace(/\/$/, '')));
};

module.exports.sync = (patterns, opts) => {
	patterns = [].concat(patterns);
	assertPatternsInput(patterns);
	const options = Object.assign({cwd: process.cwd(), ignore: []}, opts);

	if (options && options.gitignore) {
		options.ignore = options.ignore.concat(gitignorePatternsSync(options));
	}

	patterns = patterns.concat(options.ignore.map(invertGlob));
	options.ignore = [];

	return generateGlobTasks(patterns, options).reduce(
		(tasks, task) => tasks.concat(getPattern(task, dirGlob.sync).map(glob => ({pattern: glob, opts: task.opts}))), [])
			.reduce((matches, task) => arrayUnion(matches, fg.sync(task.pattern, task.opts)), [])
			// TODO Remove trailing `/`, remove this workaround when https://github.com/mrmlnc/fast-glob/issues/46 is fixed
			.map(p => p.replace(/\/$/, ''));
};

module.exports.generateGlobTasks = generateGlobTasks;

module.exports.hasMagic = (patterns, opts) => []
	.concat(patterns)
	.some(pattern => glob.hasMagic(pattern, opts));
