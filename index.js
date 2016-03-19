'use strict';
var Promise = require('pinkie-promise');
var arrayUnion = require('array-union');
var objectAssign = require('object-assign');
var glob = require('glob');
var arrify = require('arrify');
var pify = require('pify');

var globP = pify(glob, Promise);

function sortPatterns(patterns) {
	patterns = arrify(patterns);

	var positives = [];
	var negatives = [];

	patterns.forEach(function (pattern, index) {
		var isNegative = pattern[0] === '!';
		(isNegative ? negatives : positives).push({
			index: index,
			pattern: isNegative ? pattern.slice(1) : pattern
		});
	});

	return {
		positives: positives,
		negatives: negatives
	};
}

function setIgnore(opts, negatives, positiveIndex) {
	opts = objectAssign({}, opts);

	var negativePatterns = negatives.filter(function (negative) {
		return negative.index > positiveIndex;
	}).map(function (negative) {
		return negative.pattern;
	});

	opts.ignore = (opts.ignore || []).concat(negativePatterns);
	return opts;
}

function generateTasks(patterns, opts) {
	var sortedPatterns = sortPatterns(patterns);

	return sortedPatterns.positives.map(function (positive) {
		return {
			pattern: positive.pattern,
			opts: setIgnore(opts, sortedPatterns.negatives, positive.index)
		};
	});
}

module.exports = function (patterns, opts) {
	var tasks = generateTasks(patterns, opts);

	return Promise.all(tasks.map(function (task) {
		var pendingGlob = globP(task.pattern, task.opts);

		if (!task.opts.recursive) {
			return pendingGlob;
		}

		return pendingGlob.then(function (paths) {
			return Promise.all(paths.map(function (path) {
				return globP(path + '{,/**}', task.opts);
			})).then(function (paths) {
				return arrayUnion.apply(null, paths);
			});
		});
	}))
	.then(function (paths) {
		return arrayUnion.apply(null, paths);
	});
};

module.exports.sync = function (patterns, opts) {
	var tasks = generateTasks(patterns, opts);

	return tasks.reduce(function (matches, task) {
		var paths = glob.sync(task.pattern, task.opts);

		if (task.opts.recursive) {
			paths = paths.reduce(function (recusiveMatches, path) {
				return arrayUnion(recusiveMatches, glob.sync(path + '{,/**}', task.opts));
			}, []);
		}

		return arrayUnion(matches, paths);
	}, []);
};
