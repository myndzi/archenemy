'use strict';

var when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..'),
	Batcher = ArchEnemy.Batcher;

describe('Batcher', function () {
	it('should throw if no function specified', function () {
		(function () {
			var batcher = new Batcher();
		}).should.throw();
	});
	it('should emit an error if the function throws', function (done) {
		var batcher = new Batcher(function () {
			throw new Error('foo');
		}, { timeout: 0 });
		batcher.on('error', done.bind(null, null));
		batcher.add();
	});
	it('should time out and call the function', function (done) {
		var batcher = new Batcher(done.bind(null, null), { execTimeout: 0, timeout: 0 });
		batcher.add();
	});
	it('should pass an array of objects with deferred and data properties', function (done) {
		var batcher = new Batcher(function (items) {
			items.should.be.instanceof(Array);
			items[0].should.have.property('deferred');
			items[0].deferred.should.have.property('promise');
			when.isPromise(items[0].deferred.promise).should.equal(true);
			done();
		}, { execTimeout: 0, timeout: 0 })
		batcher.add();
	});
	it('should emit a timeout event if the deferreds aren\'t resolved by execTimeout', function (done) {
		var batcher = new Batcher(function () {
		}, { execTimeout: 0, timeout: 0 });
		batcher.on('timeout', done.bind(null, null));
		batcher.add();
	});
	it('should emit a done event when the deferreds are resolved', function (done) {
		var batcher = new Batcher(function (items) {
			items.forEach(function(item) {
				item.deferred.resolve();
			});
		}, { timeout: 0 });
		batcher.on('done', done.bind(null, null));
		batcher.add();
	});
	it('should emit a done event when the deferreds are rejected', function (done) {
		var batcher = new Batcher(function (items) {
			items.forEach(function(item) {
				item.deferred.reject();
			});
		}, { timeout: 0 });
		batcher.on('done', done.bind(null, null));
		batcher.add();
	});
	it('should provide this.reject and this.resolve shortcuts', function (done) {
		var batcher = new Batcher(function (items) {
			this.should.have.property('reject');
			this.should.have.property('resolve');
			this.reject();
			this.resolve();
		}, { timeout: 0 });
		batcher.on('done', done.bind(null, null));
		batcher.add();
	});
	it('should accumulate items within the timeout period', function (done) {
		var batcher = new Batcher(function (items) {
			items.length.should.equal(3);
			this.resolve();
			done();
		}, { timeout: 20 })
		batcher.add();
		batcher.add();
		batcher.add();
	});
	it('should execute immediately when reaching maxSize', function (done) {
		var batcher = new Batcher(function (items) {
			items.length.should.equal(3);
			this.resolve();
			setTimeout(done, 30);
		}, { execTimeout: 0, timeout: 0, maxSize: 3 })

		batcher.on('timeout', function () {
			throw new Error('Timeout should not trigger!');
		});
		batcher.add();
		batcher.add();
		batcher.add();
	});
	it('should not execute if below minSize', function (done) {
		var fail = true;
		var batcher = new Batcher(function () {
			this.resolve();
			fail.should.equal(false);
			done();
		}, { timeout: 0, minSize: 2 });
		
		batcher.add();
		
		setTimeout(function () {
			fail = false;
			batcher.add();
		}, 30);
	});
});
