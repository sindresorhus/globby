'use strict';
const fs = require('fs');
const arrayUnion = require('array-union');
const glob = require('glob');
const fastGlob = require('fast-glob');
const dirGlob = require('dir-glob');
const gitignore = require('./gitignore');

const isNegative = pattern => pattern[0] === '!';

const assertPatternsInput = patterns => {
	if (!patterns.every(pattern => typeof pattern === 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

const checkCwdOption = options => {
	if (options && options.cwd && !fs.statSync(options.cwd).isDirectory()) {
		throw new Error('The `cwd` option must be a path to a directory');
	}
};

// https://github.com/sindresorhus/globby/issues/97
const checkExtensionOptions = options => {
	if (
		options &&
		(options.noext === true || options.extension === false) &&
		options.expandDirectories.extensions &&
		options.expandDirectories.extensions.length !== 0
	) {
		throw new Error(
			'Using noext and expandDirectories.extensions together will fail due to upstream bugs. #97'
		);
	}
};

function gitPatterns(cb, sync = true) {
	return function (patterns, options) {
		patterns = arrayUnion([].concat(patterns));
		if (sync) {
			assertPatternsInput(patterns);
			checkCwdOption(options);
			checkExtensionOptions(options);
		} else {
			try {
				assertPatternsInput(patterns);
				checkCwdOption(options);
				checkExtensionOptions(options);
			} catch (error) {
				return Promise.reject(error);
			}
		}

		if (!options || (options && !options.gitignore)) {
			return cb(patterns, options);
		}

		const gitignoreStrings = () => {
			return Promise.resolve(
				gitignore.getPatterns({
					cwd: options.cwd,
					ignore: options.ignore
				})
			);
		};

		async function nonSync() {
			const res = await gitignoreStrings();
			return cb(patterns.concat(res));
		}

		if (!sync) {
			return nonSync();
		}

		patterns = patterns.concat(
			gitignore.getPatterns.sync({
				cwd: options.cwd,
				ignore: options.ignore
			})
		);

		return cb(patterns, options);
	};
}

const getPathString = p => p instanceof fs.Stats ? p.path : p;

const generateGlobTasks = (patterns, taskOptions) => {
	const globTasks = [];

	taskOptions = {
		ignore: [],
		expandDirectories: true,
		...taskOptions
	};

	for (const [index, pattern] of patterns.entries()) {
		if (isNegative(pattern)) {
			continue;
		}

		const ignore = patterns
			.slice(index)
			.filter(isNegative)
			.map(pattern => pattern.slice(1));

		const options = {
			...taskOptions,
			ignore: taskOptions.ignore.concat(ignore)
		};

		globTasks.push({pattern, options});
	}

	return globTasks;
};

const globDirs = (task, fn) => {
	let options = {};
	if (task.options.cwd) {
		options.cwd = task.options.cwd;
	}

	if (Array.isArray(task.options.expandDirectories)) {
		options = {
			...options,
			files: task.options.expandDirectories
		};
	} else if (typeof task.options.expandDirectories === 'object') {
		options = {
			...options,
			...task.options.expandDirectories
		};
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

const globby = async (patterns, options) => {
	const globTasks = generateGlobTasks(patterns, options);

	const getTasks = async () => {
		const tasks = await Promise.all(globTasks.map(async task => {
			const globs = await getPattern(task, dirGlob);
			return Promise.all(globs.map(globToTask(task)));
		}));

		return arrayUnion(...tasks);
	};

	const tasks = await getTasks();
	const paths = await Promise.all(tasks.map(task => fastGlob(task.pattern, task.options)));
	return arrayUnion(...paths).map(getPathString);
};

module.exports = gitPatterns(globby, false);

module.exports.sync = gitPatterns((patterns, options) => {
	patterns = arrayUnion([].concat(patterns));

	const globTasks = generateGlobTasks(patterns, options);
	const tasks = globTasks.reduce((tasks, task) => {
		const newTask = getPattern(task, dirGlob.sync).map(globToTask(task));
		return tasks.concat(newTask);
	}, []);

	return tasks.reduce(
		(matches, task) =>
			arrayUnion(matches, fastGlob.sync(task.pattern, task.options)),
		[]
	);
});

module.exports.generateGlobTasks = gitPatterns(generateGlobTasks);

module.exports.hasMagic = gitPatterns((patterns, options) =>
	[].concat(patterns).some(pattern => glob.hasMagic(pattern, options))
);

module.exports.gitignore = gitignore;
