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

it('should glob - async', function () {
	return globby('*.tmp').then(function (paths) {
		assert.deepEqual(paths, ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	});
});

it('should glob with multiple patterns - async', function () {
	return globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp']).then(function (paths) {
		assert.deepEqual(paths, ['a.tmp', 'b.tmp']);
	});
});

it('should respect patterns order - async', function () {
	return globby(['!*.tmp', 'a.tmp']).then(function (paths) {
		assert.deepEqual(paths, ['a.tmp']);
	});
});

it('should glob - sync', function () {
	assert.deepEqual(globby.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	assert.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	assert.deepEqual(globby.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

it('should return [] for all negative patterns - sync', function () {
	assert.deepEqual(globby.sync(['!a.tmp', '!b.tmp']), []);
});

it('should return [] for all negative patterns - async', function () {
	return globby(['!a.tmp', '!b.tmp']).then(function (paths) {
		assert.deepEqual(paths, []);
	});
});

it('cwd option', function () {
	process.chdir('tmp');
	assert.deepEqual(globby.sync('*.tmp', {cwd: cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	assert.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd: cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

it('should not mutate the options object - async', function () {
	return globby(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
});

it('should not mutate the options object - sync', function () {
	globby.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
});
