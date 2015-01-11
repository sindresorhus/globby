'use strict';
var union = require('array-union');
var async = require('async');
var glob = require('glob');

function arrayify(arr) {
	return Array.isArray(arr) ? arr : [arr];
}

function sortPatterns(patterns) {
	patterns = arrayify(patterns);

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
	var negativePatterns = negatives.filter(function (negative) {
		return negative.index > positiveIndex;
	}).map(function (negative) {
		return negative.pattern;
	});

	opts.ignore = (opts.ignore || []).concat(negativePatterns);
}

module.exports = function (patterns, opts, cb) {
	var sortedPatterns = sortPatterns(patterns);

	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}

	if (sortedPatterns.positives.length === 0) {
		cb(null, []);
		return;
	}

	async.parallel(sortedPatterns.positives.map(function (positive) {
		return function (cb2) {
			setIgnore(opts, sortedPatterns.negatives, positive.index);

			glob(positive.pattern, opts, function (err, paths) {
				if (err) {
					cb2(err);
					return;
				}
				cb2(null, paths);
			});
		};
	}), function (err, paths) {
		if (err) {
			cb(err);
			return;
		}

		cb(null, union.apply(null, paths));
	});
};

module.exports.sync = function (patterns, opts) {
	var sortedPatterns = sortPatterns(patterns);

	if (sortedPatterns.positives.length === 0) {
		return [];
	}

	opts = opts || {};

	return sortedPatterns.positives.reduce(function (ret, positive) {
		setIgnore(opts, sortedPatterns.negatives, positive.index);
		return union(ret, glob.sync(positive.pattern, opts));
	}, []);

};
