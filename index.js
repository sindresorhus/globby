'use strict';
var Promise = require('pinkie-promise');
var arrayUnion = require('array-union');
var objectAssign = require('object-assign');
var glob = require('glob');
var arrify = require('arrify');
var pify = require('pify');

var globP = pify(glob, Promise).bind(glob);

function isNegative(pattern) {
	return pattern[0] === '!';
}

function isString(value) {
	return typeof value === 'string';
}

function validatePatternsArray(patterns) {
	if (isString(patterns)) {
		// bail early, the rest will easier this way
		return;
	}

	var err = new TypeError('patterns must be a string or an array of strings');

	if (!Array.isArray(patterns)) {
		return err;
	}

	if (patterns.filter(isString).length !== patterns.length) {
		return err;
	}
}

function generateGlobTasks(patterns, opts) {
	var globTasks = [];

	patterns = arrify(patterns);
	opts = objectAssign({
		cache: Object.create(null),
		statCache: Object.create(null),
		realpathCache: Object.create(null),
		symlinks: Object.create(null),
		ignore: []
	}, opts);

	patterns.forEach(function (pattern, i) {
		if (isNegative(pattern)) {
			return;
		}

		var ignore = patterns.slice(i).filter(isNegative).map(function (pattern) {
			return pattern.slice(1);
		});

		globTasks.push({
			pattern: pattern,
			opts: objectAssign({}, opts, {
				ignore: opts.ignore.concat(ignore)
			})
		});
	});

	return globTasks;
}

module.exports = function (patterns, opts) {
	var validationError = validatePatternsArray(patterns);

	if (validationError) {
		return Promise.reject(validationError);
	}

	var globTasks = generateGlobTasks(patterns, opts);

	return Promise.all(globTasks.map(function (task) {
		return globP(task.pattern, task.opts);
	})).then(function (paths) {
		return arrayUnion.apply(null, paths);
	});
};

module.exports.sync = function (patterns, opts) {
	var validationError = validatePatternsArray(patterns);

	if (validationError) {
		throw validationError;
	}

	var globTasks = generateGlobTasks(patterns, opts);

	return globTasks.reduce(function (matches, task) {
		return arrayUnion(matches, glob.sync(task.pattern, task.opts));
	}, []);
};

module.exports.generateGlobTasks = generateGlobTasks;
