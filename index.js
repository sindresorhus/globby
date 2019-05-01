'use strict';
const fs = require('fs');
const arrayUnion = require('array-union');
const glob = require('glob');
const fastGlob = require('fast-glob');
const dirGlob = require('dir-glob');
const gitignore = require('./gitignore');

const isNegative = pattern => pattern[0] === '!';

const assertPatternsInput = patterns => {
	if (!patterns.every(x => typeof x === 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

const checkCwdOption = options => {
	if (options && options.cwd && !fs.statSync(options.cwd).isDirectory()) {
		throw new Error('The `cwd` option must be a path to a directory');
	}
};

const generateGlobTasks = (patterns, taskOptions) => {
	patterns = arrayUnion([].concat(patterns));
	assertPatternsInput(patterns);
	checkCwdOption(taskOptions);

	const globTasks = [];

	taskOptions = Object.assign({
		ignore: [],
		expandDirectories: true
	}, taskOptions);

	patterns.forEach((pattern, i) => {
		if (isNegative(pattern)) {
			return;
		}

		const ignore = patterns
			.slice(i)
			.filter(isNegative)
			.map(pattern => pattern.slice(1));

		const options = Object.assign({}, taskOptions, {
			ignore: taskOptions.ignore.concat(ignore)
		});

		globTasks.push({pattern, options});
	});

	return globTasks;
};

const globDirs = (task, fn) => {
	let options = {};
	if (task.options.cwd) {
		options.cwd = task.options.cwd;
	}

	if (Array.isArray(task.options.expandDirectories)) {
		options = Object.assign(options, {files: task.options.expandDirectories});
	} else if (typeof task.options.expandDirectories === 'object') {
		options = Object.assign(options, task.options.expandDirectories);
	}

	return fn(task.pattern, options);
};

const getPattern = (task, fn) => task.options.expandDirectories ? globDirs(task, fn) : [task.pattern];

const globToTask = task => glob => {
	const {options} = task;
	if (options.ignore && Array.isArray(options.ignore) && options.expandDirectories) {
		options.ignore = dirGlob.sync(options.ignore);
	}

	return {
		pattern: glob,
		options
	};
};

const globby = (patterns, options) => {
	let globTasks;
	patterns = arrayUnion([].concat(patterns));

	try {
		assertPatternsInput(patterns);
		checkCwdOption(options);
	} catch (error) {
		return Promise.reject(error);
	}

	const gitignoreStrings = () => {
		return Promise.resolve(
			options && options.gitignore ?
				gitignore.getPatterns({cwd: options.cwd, ignore: options.ignore}) :
				[]
		);
	};

	return gitignoreStrings().then(gitignoreStrings => {
		console.log();

		try {
			globTasks = generateGlobTasks(patterns.concat(gitignoreStrings), options);
		} catch (error) {
			return Promise.reject(error);
		}

		const getTasks = Promise.all(globTasks.map(task => Promise.resolve(getPattern(task, dirGlob))
			.then(globs => Promise.all(globs.map(globToTask(task))))
		))
			.then(tasks => arrayUnion(...tasks));

		return getTasks
			.then(tasks => Promise.all(tasks.map(task => fastGlob(task.pattern, task.options))))
			.then(paths => arrayUnion(...paths))
			.then(res => {
				return res;
			});
	});
};

module.exports = globby;
// TODO: Remove this for the next major release
module.exports.default = globby;

module.exports.sync = (patterns, options) => {
	patterns = arrayUnion([].concat(patterns));
	assertPatternsInput(patterns);
	checkCwdOption(options);
	const gitignoreStrings = options && options.gitignore ?
		gitignore.getPatterns.sync({cwd: options.cwd, ignore: options.ignore}) :
		[];
	const globTasks = generateGlobTasks(patterns.concat(gitignoreStrings), options);
	const tasks = globTasks.reduce((tasks, task) => {
		const newTask = getPattern(task, dirGlob.sync).map(globToTask(task));
		return tasks.concat(newTask);
	}, []);

	return tasks.reduce(
		(matches, task) => arrayUnion(matches, fastGlob.sync(task.pattern, task.options)),
		[]
	);
};

module.exports.generateGlobTasks = generateGlobTasks;

module.exports.hasMagic = (patterns, options) => []
	.concat(patterns)
	.some(pattern => glob.hasMagic(pattern, options));

module.exports.gitignore = gitignore;
