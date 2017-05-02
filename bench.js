'use strict';
/* global after, before, bench, suite */
const fs = require('fs');
const rimraf = require('rimraf');
const globbyMaster = require('globby');
const gs = require('glob-stream');
const globby = require('.');

const BENCH_DIR = 'bench';

const runners = [{
	name: 'globby async (working directory)',
	run: (patterns, cb) => {
		globby(patterns).then(cb.bind(null, null), cb);
	}
}, {
	name: 'globby async (upstream/master)',
	run: (patterns, cb) => {
		globbyMaster(patterns).then(cb.bind(null, null), cb);
	}
}, {
	name: 'globby sync (working directory)',
	run: patterns => {
		globby.sync(patterns);
	}
}, {
	name: 'globby sync (upstream/master)',
	run: patterns => {
		globbyMaster.sync(patterns);
	}
}, {
	name: 'glob-stream',
	run: (patterns, cb) => {
		gs(patterns).on('data', () => {}).on('end', cb);
	}
}];
const benchs = [{
	name: 'negative globs (some files inside dir)',
	patterns: ['a/*', '!a/c*']
}, {
	name: 'negative globs (whole dir)',
	patterns: ['a/*', '!a/**']
}, {
	name: 'multiple positive globs',
	patterns: ['a/*', 'b/*']
}];

before(() => {
	process.chdir(__dirname);
	rimraf.sync(BENCH_DIR);
	fs.mkdirSync(BENCH_DIR);
	process.chdir(BENCH_DIR);
	['a', 'b']
		.map(dir => `${dir}/`)
		.forEach(dir => {
			fs.mkdirSync(dir);
			for (let i = 0; i < 500; i++) {
				fs.writeFileSync(dir + (i < 100 ? 'c' : 'd') + i, '');
			}
		});
});

after(() => {
	process.chdir(__dirname);
	rimraf.sync(BENCH_DIR);
});

benchs.forEach(benchmark => {
	suite(benchmark.name, () => {
		runners.forEach(runner => bench(runner.name, runner.run.bind(null, benchmark.patterns)));
	});
});
