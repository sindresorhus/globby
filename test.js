'use strict';
var assert = require('assert');
var fs = require('fs');
var globby = require('./');

var fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
];

before(function () {
	fixture.forEach(fs.writeFileSync.bind(fs));
});

after(function () {
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

it('should glob - sync', function () {
	assert.deepEqual(globby.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	assert.deepEqual(globby.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});
