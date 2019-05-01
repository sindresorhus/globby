"use strict";
const fs = require("fs");
const arrayUnion = require("array-union");
const glob = require("glob");
const fastGlob = require("fast-glob");
const dirGlob = require("dir-glob");
const gitignore = require("./gitignore");

const isNegative = (pattern) => pattern[0] === "!";

const assertPatternsInput = (patterns) => {
	if (!patterns.every((x) => typeof x === "string")) {
		throw new TypeError("Patterns must be a string or an array of strings");
	}
};

const checkCwdOption = (options) => {
	if (options && options.cwd && !fs.statSync(options.cwd).isDirectory()) {
		throw new Error("The `cwd` option must be a path to a directory");
	}
};

function gitPatterns(cb, sync = true) {
	return function(patterns, options) {
		patterns = arrayUnion([].concat(patterns));
		if (sync) {
			assertPatternsInput(patterns);
			checkCwdOption(options);
		} else {
			try {
				assertPatternsInput(patterns);
				checkCwdOption(options);
			} catch (error) {
				return Promise.reject(error);
			}
		}

		if (!options || (options && !options.gitignore)) {
			return cb(patterns, options);
		}

		const gitignoreStrings = () => {
			return Promise.resolve(
				patterns.concat(
					gitignore.getPatterns({
						cwd: options.cwd,
						ignore: options.ignore
					})
				)
			);
		};

		if (!sync) {
			return gitignoreStrings().then(cb);
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

const generateGlobTasks = (patterns, taskOptions) => {
	const globTasks = [];

	taskOptions = Object.assign(
		{
			ignore: [],
			expandDirectories: true
		},
		taskOptions
	);

	patterns.forEach((pattern, i) => {
		if (isNegative(pattern)) {
			return;
		}

		const ignore = patterns
			.slice(i)
			.filter(isNegative)
			.map((pattern) => pattern.slice(1));

		const options = Object.assign({}, taskOptions, {
			ignore: taskOptions.ignore.concat(ignore)
		});

		globTasks.push({ pattern, options });
	});

	return globTasks;
};

const globDirs = (task, fn) => {
	let options = {};
	if (task.options.cwd) {
		options.cwd = task.options.cwd;
	}

	if (Array.isArray(task.options.expandDirectories)) {
		options = Object.assign(options, {
			files: task.options.expandDirectories
		});
	} else if (typeof task.options.expandDirectories === "object") {
		options = Object.assign(options, task.options.expandDirectories);
	}

	return fn(task.pattern, options);
};

const getPattern = (task, fn) =>
	task.options.expandDirectories ? globDirs(task, fn) : [task.pattern];

const globToTask = (task) => (glob) => {
	const { options } = task;
	if (
		options.ignore &&
		Array.isArray(options.ignore) &&
		options.expandDirectories
	) {
		options.ignore = dirGlob.sync(options.ignore);
	}

	return {
		pattern: glob,
		options
	};
};

const globby = (patterns, options) => {
	let globTasks;

	try {
		globTasks = generateGlobTasks(patterns, options);
	} catch (error) {
		return Promise.reject(error);
	}

	const getTasks = Promise.all(
		globTasks.map((task) =>
			Promise.resolve(getPattern(task, dirGlob)).then((globs) =>
				Promise.all(globs.map(globToTask(task)))
			)
		)
	).then((tasks) => arrayUnion(...tasks));

	return getTasks
		.then((tasks) =>
			Promise.all(
				tasks.map((task) => fastGlob(task.pattern, task.options))
			)
		)
		.then((paths) => arrayUnion(...paths))
		.then((res) => {
			return res;
		});
};

module.exports = gitPatterns(globby, false);
// TODO: Remove this for the next major release
module.exports.default = gitPatterns(globby, false);

module.exports.sync = gitPatterns((patterns, options) => {
	patterns = arrayUnion([].concat(patterns));
	assertPatternsInput(patterns);
	checkCwdOption(options);

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
	[].concat(patterns).some((pattern) => glob.hasMagic(pattern, options))
);

module.exports.gitignore = gitignore;
