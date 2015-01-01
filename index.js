'use strict';
var union = require('array-union');
var async = require('async');
var glob = require('glob');
var Minimatch = require('minimatch').Minimatch;

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
		(pattern[0] === '!' ? negatives : positives).push({
			index: index,
			pattern: pattern
		});
	});

	if (positives.length === 0) {
		cb(null, []);
		return;
	}

	negatives.forEach(function (negative) {
		negative.matcher = new Minimatch(negative.pattern, opts);
	});

	async.parallel(positives.map(function (positive) {
		return function (cb2) {
			glob(positive.pattern, opts, function (err, paths) {
				if (err) {
					cb2(err);
					return;
				}

				var negativeMatchers = negatives.filter(function (negative) {
					return negative.index > positive.index;
				}).map(function (negative) {
					return negative.matcher;
				});

				if (negativeMatchers.length === 0) {
					cb2(null, paths);
					return;
				}

				cb2(null, paths.filter(function (path) {
					return negativeMatchers.every(function (matcher) {
						return matcher.match(path);
					});
				}));
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
	patterns = arrayify(patterns);

	if (patterns.length === 0) {
		return [];
	}

	opts = opts || {};

	return patterns.reduce(function (ret, pattern) {
		if (pattern[0] === '!') {
			var matcher = new Minimatch(pattern, opts);
			return ret.filter(function (path) {
				return matcher.match(path);
			});
		}

		return union(ret, glob.sync(pattern, opts));
	}, []);
};
