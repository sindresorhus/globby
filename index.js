'use strict';
const arrayUnion = require('array-union');
const glob = require('glob');
const pify = require('pify');

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
		ignore: []
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

module.exports = (patterns, opts) => {
	let globTasks;

	try {
		globTasks = generateGlobTasks(patterns, opts);
	} catch (err) {
		return Promise.reject(err);
	}

	return Promise.all(
			globTasks.map(task => globP(task.pattern, task.opts))
		)
		.then(paths => arrayUnion.apply(null, paths));
};

module.exports.sync = (patterns, opts) => {
	const globTasks = generateGlobTasks(patterns, opts);

	return globTasks.reduce(
		(matches, task) => arrayUnion(matches, glob.sync(task.pattern, task.opts)),
		[]
	);
};

module.exports.generateGlobTasks = generateGlobTasks;

module.exports.hasMagic = (patterns, opts) => []
	.concat(patterns)
	.some(pattern => glob.hasMagic(pattern, opts));
