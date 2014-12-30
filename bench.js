'use strict';
var assert = require('assert');
var fs = require('fs');
var globby = require('./');
var gs = require('glob-stream');
var rimraf = require('rimraf');

var benchDir = 'bench';
var runners = [{
	name: 'globby - async',
	run: function (patterns, cb) {
		globby(patterns, cb);
	}
}, {
	name: 'globby - sync',
	run: function (patterns) {
		globby.sync(patterns);
	}
}, {
	name: 'glob-stream',
	run: function (patterns, cb) {
		gs.create(patterns).on('data', function () {}).on('end', cb);
	}
}];
var benchs = [{
	name: 'negative globs',
	patterns: ['bench/**', '!bench/b/*']
}, {
	name: 'multiple positive globs',
	patterns: ['bench/a/*', 'bench/b/*']
}];

before(function () {
	rimraf.sync(benchDir);
	fs.mkdirSync(benchDir);
	['a', 'b'].forEach(function (dir) {
		var path = benchDir + '/' + dir + '/';
		fs.mkdirSync(path);
		for (var i = 0; i < 100; i++) {
			fs.writeFileSync(path + i, '');
		}
	});
});

after(function () {
	rimraf.sync(benchDir);
});

runners.forEach(function (runner) {
	suite(runner.name, function () {
		benchs.forEach(function (benchmark) {
			bench(benchmark.name, runner.run.bind(null, benchmark.patterns));
		});
	});
});
