'use strict';
const arrayUnion = require('array-union');
const glob = require('glob');
const pify = require('pify');
const dirGlob = require('dir-glob');

const globP = pify(glob);

const isNegative = pattern => pattern[0] === '!';
const isString = value => typeof value === 'string';

const assertPatternsInput = patterns => {
	if (!patterns.every(isString)) {
		throw new TypeError('patterns must be a string or an array of strings');
	}
};

const generateGlobTasks = (patterns, taskOpts) => {
	patterns = [].concat(patterns);
	assertPatternsInput(patterns);

	const globTasks = [];

	taskOpts = Object.assign({
		cache: Object.create(null),
		statCache: Object.create(null),
		realpathCache: Object.create(null),
		symlinks: Object.create(null),
		ignore: [],
		expandDirectories: true,
		nodir: true
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

module.exports = (patterns, opts) => {
	let globTasks;

	try {
		globTasks = generateGlobTasks(patterns, opts);
	} catch (err) {
		return Promise.reject(err);
	}

	const getTasks = Promise.all(globTasks.map(task => Promise.resolve(getPattern(task, dirGlob))
		.then(globs => Promise.all(globs.map(glob => ({
			pattern: glob,
			opts: task.opts
		}))))
	))
		.then(tasks => arrayUnion.apply(null, tasks));

	return getTasks.then(tasks => Promise.all(tasks.map(task => globP(task.pattern, task.opts))))
		.then(paths => arrayUnion.apply(null, paths));
};

module.exports.sync = (patterns, opts) => {
	const globTasks = generateGlobTasks(patterns, opts);
	const tasks = globTasks.reduce(
		(tasks, task) => arrayUnion(getPattern(task, dirGlob.sync).map(glob => ({
			pattern: glob,
			opts: task.opts
		}))),
		[]
	);

	return tasks.reduce(
		(matches, task) => arrayUnion(matches, glob.sync(task.pattern, task.opts)),
		[]
	);
};

module.exports.generateGlobTasks = generateGlobTasks;

module.exports.hasMagic = (patterns, opts) => []
	.concat(patterns)
	.some(pattern => glob.hasMagic(pattern, opts));
