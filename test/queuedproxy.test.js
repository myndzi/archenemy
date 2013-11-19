'use strict';

var queuedProxy = require('../lib/queuedproxy'),
	when = require('when'),
	assert = require('assert'),
	should = require('should');

when.delay = require('when/delay');

describe('queuedProxy', function () {
	it('should honor the "connected" parameter', function () {
		var proxy = queuedProxy(function () {}, true);
		proxy.isConnected().should.equal(true);
	});
	it('should default to disconnected', function () {
		var proxy = queuedProxy(function () {});
		proxy.isConnected().should.equal(false);
	});
	it('should throw if no function is supplied', function () {
		queuedProxy.should.throw();
	});
	
	describe('when disconnected', function () {
		it('should queue function calls', function (done) {
			var okay = false;
			var proxy = queuedProxy(function () { okay.should.equal(true); });
			proxy();
			when.delay(30).then(function () {
				okay = true;
				proxy.connect();
				return when.delay(30);
			}).ensure(done);
		});
		it('should maintain call order', function (done) {
			var count = 0;
			var proxy = queuedProxy(function (callback) { count++; callback(); });

			proxy(function () { count.should.equal(1); });
			proxy(function () { count.should.equal(2); });
			
			when.delay(30).then(function () {
				okay = true;
				proxy.connect();
				return when.delay(30);
			}).ensure(done);			
		});
		it('should maintain "this" association', function (done) {
			var thisArg = { };
			thisArg.proxy = queuedProxy(function () { this.should.equal(thisArg); });
			thisArg.proxy();
			when.delay(30).then(function () {
				okay = true;
				thisArg.proxy.connect();
				return when.delay(30);
			}).ensure(done);
		});
		it('should pass arguments', function (done) {
			var a = {}, b = {};
			var proxy = queuedProxy(function (_a, _b) {
				a.should.equal(_a);
				b.should.equal(_b);
			});
			proxy(a, b);
			when.delay(30).then(function () {
				proxy.connect();
				return when.delay(30);
			}).ensure(done);
		});
	});
	describe('when connected', function () {
		it('should execute function calls immediately (but async)', function (done) {
			var okay = false;
			var proxy = queuedProxy(function () {
				okay = true;
				done();
			}, true);
			proxy();
			okay.should.equal(false);
		});
		it('should maintain call order', function (done) {
			var count = 0;
			var proxy = queuedProxy(function (callback) { count++; callback(); }, true);

			proxy(function () { count.should.equal(1); });
			proxy(function () { count.should.equal(2); done(); });
		});
		it('should maintain "this"', function (done) {
			var thisArg = {};
			thisArg.proxy = queuedProxy(function () {
				this.should.equal(thisArg);
				done();
			}, true);
			
			thisArg.proxy();
		});
		it('should pass arguments', function (done) {
			var a = {}, b = {};
			var proxy = queuedProxy(function (_a, _b) {
				a.should.equal(_a);
				b.should.equal(_b);
				done();
			}, true);
			proxy(a, b);
		});
	});
});
