'use strict';
var assert = require('assert');
var fs = require('fs');
var globby = require('./');

var cwd = process.cwd();
var fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
];

before(function () {
	fs.mkdirSync('tmp');
	fixture.forEach(fs.writeFileSync.bind(fs));
});

after(function () {
	fs.rmdirSync('tmp');
	fixture.forEach(fs.unlinkSync.bind(fs));
});

it('should glob - async', function (cb) {
	globby('*.tmp', function (err, paths) {
		assert(!err, err);
		assert.deepEqual(paths, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
		cb();
	});
});

it('should glob with multiple patterns - async', function (cb) {
	globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], function (err, paths) {
		assert(!err, err);
		assert.deepEqual(paths, ['a.tmp', 'b.tmp']);
		cb();
	});
});

it('should respect patterns order - async', function (cb) {
	globby(['!*.tmp', 'a.tmp'], function (err, paths) {
		assert(!err, err);
		assert.deepEqual(paths, ['a.tmp']);
		cb();
	});
});

it('should glob - sync', function () {
	assert.deepEqual(globby.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	assert.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	assert.deepEqual(globby.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

it('cwd option', function () {
	process.chdir('tmp');
	assert.deepEqual(globby.sync('*.tmp', {cwd: cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	assert.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd: cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

it('should not mutate the options object - async', function (cb) {
	globby(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}), function (err, paths) {
		assert(!err, err);
		cb();
	});
});

it('should not mutate the options object - sync', function () {
	globby.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
});
