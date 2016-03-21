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
	'e.tmp',
	'nested/filtered/f.tmp',
	'nested/filtered/g.tmp',
	'nested/filtered/.subdir/hidden.tmp',
	'nested/subdir/f.tmp',
	'nested/i.tmp'
];

before(function () {
	fs.mkdirSync('tmp');
	fs.mkdirSync('nested');
	fs.mkdirSync('nested/filtered');
	fs.mkdirSync('nested/filtered/.subdir');
	fs.mkdirSync('nested/subdir');
	fixture.forEach(fs.writeFileSync.bind(fs));
});

after(function () {
	fixture.forEach(fs.unlinkSync.bind(fs));
	fs.rmdirSync('tmp');
	fs.rmdirSync('nested/subdir');
	fs.rmdirSync('nested/filtered/.subdir');
	fs.rmdirSync('nested/filtered');
	fs.rmdirSync('nested');
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

it('recursive option - sync', function () {
	var actual = globby.sync(['nested', '!nested/filtered', 'nested/filtered', '!**/filtered/**/f.tmp'], {recursive: true});
	var expected = [
		'nested',
		'nested/i.tmp',
		'nested/filtered',
		'nested/filtered/g.tmp',
		'nested/subdir',
		'nested/subdir/f.tmp'
	];

	actual.sort();
	expected.sort();

	assert.deepEqual(actual, expected);
});

it('recursive option - async', function () {
	var actual = globby(['nested', '!nested/filtered', 'nested/filtered', '!**/filtered/**/f.tmp'], {recursive: true});
	var expected = [
		'nested',
		'nested/i.tmp',
		'nested/filtered',
		'nested/filtered/g.tmp',
		'nested/subdir',
		'nested/subdir/f.tmp'
	];

	expected.sort();

	return actual.then(function (actual) {
		actual.sort();
		assert.deepEqual(actual, expected);
	});
});

it('recursive and dot option - sync', function () {
	var actual = globby.sync(['nested', '!nested/filtered', 'nested/filtered', '!**/filtered/**/f.tmp'], {recursive: true, dot: true});
	var expected = [
		'nested',
		'nested/i.tmp',
		'nested/filtered',
		'nested/filtered/g.tmp',
		'nested/filtered/.subdir',
		'nested/filtered/.subdir/hidden.tmp',
		'nested/subdir',
		'nested/subdir/f.tmp'
	];

	actual.sort();
	expected.sort();

	assert.deepEqual(actual, expected);
});

it('recursive and dot option - async', function () {
	var actual = globby(['nested', '!nested/filtered', 'nested/filtered', '!**/filtered/**/f.tmp'], {recursive: true, dot: true});
	var expected = [
		'nested',
		'nested/i.tmp',
		'nested/filtered',
		'nested/filtered/g.tmp',
		'nested/filtered/.subdir',
		'nested/filtered/.subdir/hidden.tmp',
		'nested/subdir',
		'nested/subdir/f.tmp'
	];

	expected.sort();

	return actual.then(function (actual) {
		actual.sort();
		assert.deepEqual(actual, expected);
	});
});
