'use strict';
var union = require('array-union');
var async = require('async');
var glob = require('glob');
var minimatch = require('minimatch');

function arrayify(arr) {
	return Array.isArray(arr) ? arr : [arr];
}

module.exports = function (patterns, opts, cb) {
	patterns = arrayify(patterns);

	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}

	var positives = [];
	var negatives = [];

	patterns.forEach(function (pattern, index) {
		var patternArray = pattern[0] === '!' ? negatives : positives;
		patternArray.push({
			index: index,
			pattern: pattern
		});
	});

	if (positives.length === 0) {
		cb(null, []);
		return;
	}

	async.parallel(positives.map(function (positive) {
		return function (callback) {
			glob(positive.pattern, opts, function (err, paths) {
				if (err) {
					callback(err);
					return;
				}

				var negativePatterns = negatives.filter(function (negative) {
					return negative.index > positive.index;
				}).map(function (negative) {
					return negative.pattern;
				});

				if (negativePatterns.length === 0) {
					callback(null, paths);
					return;
				}

				callback(null, paths.filter(function (path) {
					return negativePatterns.every(function (pattern) {
						return minimatch(path, pattern, opts);
					});
				}));
			});
		};
	}), function (err, paths) {
		if (err) {
			throw err;
		}
		cb(null, union.apply(null, paths));
	});
};

module.exports.sync = function (patterns, opts) {
	patterns = arrayify(patterns);

	if (patterns.length === 0) {
		return [];
	}

	opts = opts || {};

	return patterns.reduce(function (ret, pattern) {
		if (pattern[0] === '!') {
			return ret.filter(function(path) {
				return minimatch(path, pattern, opts);
			});
		}

		return union(ret, glob.sync(pattern, opts));
	}, []);
};
