'use strict';
var Promise = require('pinkie-promise');
var arrayUnion = require('array-union');
var objectAssign = require('object-assign');
var glob = require('glob');
var pify = require('pify');

var globP = pify(glob, Promise).bind(glob);

function isNegative(pattern) {
	return pattern[0] === '!';
}

function isString(value) {
	return typeof value === 'string';
}

function assertPatternsInput(patterns) {
	if (!patterns.every(isString)) {
		throw new TypeError('patterns must be a string or an array of strings');
	}
}

function generateGlobTasks(patterns, opts) {
	patterns = Array.isArray(patterns) ? patterns : [patterns];
	assertPatternsInput(patterns);

	var globTasks = [];

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
		ignore = opts.ignore.concat(ignore);

		// Convert negated ignores into positive patterns
		ignore.forEach(function (ign) {
			if (!isNegative(ign)) {
				return;
			}
			globTasks.push({
				pattern: ign.slice(1),
				opts: objectAssign({}, opts, {ignore: []})
			});
		});

		// Remove negated ignores from array
		ignore = ignore.filter(function (ign) {
			return !isNegative(ign);
		});

		globTasks.push({
			pattern: pattern,
			opts: objectAssign({}, opts, {
				ignore: ignore
			})
		});
	});

	return globTasks;
}

module.exports = function (patterns, opts) {
	var globTasks;

	try {
		globTasks = generateGlobTasks(patterns, opts);
	} catch (err) {
		return Promise.reject(err);
	}

	return Promise.all(globTasks.map(function (task) {
		return globP(task.pattern, task.opts);
	})).then(function (paths) {
		return arrayUnion.apply(null, paths);
	});
};

module.exports.sync = function (patterns, opts) {
	var globTasks = generateGlobTasks(patterns, opts);

	return globTasks.reduce(function (matches, task) {
		return arrayUnion(matches, glob.sync(task.pattern, task.opts));
	}, []);
};

module.exports.generateGlobTasks = generateGlobTasks;
