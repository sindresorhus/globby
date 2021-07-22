/* global after, before, bench, suite */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import rimraf from 'rimraf';
import globbyMainBranch from 'globby';
import gs from 'glob-stream';
import fastGlob from 'fast-glob';
import {globby, globbySync} from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = 'bench';

const runners = [
	{
		name: 'globby async (working directory)',
		run: async (patterns, callback) => {
			await globby(patterns);
			callback();
		},
	},
	{
		name: 'globby async (upstream/main)',
		run: async (patterns, callback) => {
			await globbyMainBranch(patterns);
			callback();
		},
	},
	{
		name: 'globby sync (working directory)',
		run: patterns => {
			globbySync(patterns);
		},
	},
	{
		name: 'globby sync (upstream/main)',
		run: patterns => {
			globbyMainBranch.sync(patterns);
		},
	},
	{
		name: 'glob-stream',
		run: (patterns, cb) => {
			gs(patterns).on('data', () => {}).on('end', cb);
		},
	},
	{
		name: 'fast-glob async',
		run: async (patterns, callback) => {
			await fastGlob(patterns);
			callback();
		},
	},
	{
		name: 'fast-glob sync',
		run: patterns => {
			fastGlob.sync(patterns);
		},
	}
];

const benchs = [
	{
		name: 'negative globs (some files inside dir)',
		patterns: [
			'a/*',
			'!a/c*',
		],
	},
	{
		name: 'negative globs (whole dir)',
		patterns: [
			'a/*',
			'!a/**',
		],
	},
	{
		name: 'multiple positive globs',
		patterns: [
			'a/*',
			'b/*',
		],
	}
];

before(() => {
	process.chdir(__dirname);
	rimraf.sync(BENCH_DIR);
	fs.mkdirSync(BENCH_DIR);
	process.chdir(BENCH_DIR);

	const directories = ['a', 'b']
		.map(directory => `${directory}/`);

	for (const directory of directories) {
		fs.mkdirSync(directory);
		for (let i = 0; i < 500; i++) {
			fs.writeFileSync(directory + (i < 100 ? 'c' : 'd') + i, '');
		}
	}
});

after(() => {
	process.chdir(__dirname);
	rimraf.sync(BENCH_DIR);
});

for (const benchmark of benchs) {
	suite(benchmark.name, () => {
		for (const runner of runners) {
			bench(runner.name, runner.run.bind(null, benchmark.patterns));
		}
	});
}
