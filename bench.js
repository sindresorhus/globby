import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Benchmark from 'benchmark';
import rimraf from 'rimraf';
import * as globbyMainBranch from '@globby/main-branch';
import gs from 'glob-stream';
import fastGlob from 'fast-glob';
import {globby, globbySync, globbyStream} from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = 'bench';

const runners = [
	{
		name: 'globby async (working directory)',
		run: globby,
	},
	{
		name: 'globby async (upstream/main)',
		run: globbyMainBranch.globby,
	},
	{
		name: 'globby sync (working directory)',
		run: globbySync,
	},
	{
		name: 'globby sync (upstream/main)',
		run: globbyMainBranch.globbySync,
	},
	{
		name: 'globby stream (working directory)',
		run: patterns => new Promise(resolve => {
			globbyStream(patterns).on('data', () => {}).on('end', resolve);
		}),
	},
	{
		name: 'globby stream (upstream/main)',
		run: patterns => new Promise(resolve => {
			globbyMainBranch.globbyStream(patterns).on('data', () => {}).on('end', resolve);
		}),
	},
	{
		name: 'glob-stream',
		run: patterns => new Promise(resolve => {
			gs(patterns).on('data', () => {}).on('end', resolve);
		}),
	},
	{
		name: 'fast-glob async',
		run: fastGlob,
	},
	{
		name: 'fast-glob sync',
		run: fastGlob.sync,
	},
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
	},
];

const before = () => {
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
};

const after = () => {
	process.chdir(__dirname);
	rimraf.sync(BENCH_DIR);
};

const suites = [];
for (const {name, patterns} of benchs) {
	const suite = new Benchmark.Suite(name, {
		onStart() {
			before();

			console.log(`[*] Started Benchmarks "${this.name}"`);
		},
		onCycle(event) {
			console.log(`[+] ${String(event.target)}`);
		},
		onComplete() {
			after();

			console.log(`\nFastest is ${this.filter('fastest').map('name')} \n`);
		},
	});

	for (const {name, run} of runners) {
		suite.add(name, run.bind(undefined, patterns));
	}

	suites.push(suite);
}

let index = 0;
const run = suite => {
	suite.on('complete', () => {
		const next = suites[++index];
		if (next) {
			run(next);
		}
	});
	suite.run({async: true});
};

run(suites[0]);
