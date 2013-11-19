'use strict';

var util = require('../lib/util'),
	assert = require('assert'),
	should = require('should');

describe('Util', function () {
	describe('.makeConnectString', function () {
		it('should work with no arguments', function () {
			util.makeConnectString().should.equal('amqp://localhost');
		});
		it('should not alter the "url" argument', function () {
			util.makeConnectString('foo').should.equal('foo');
		});
		it('should construct query string', function () {
			util.makeConnectString('foo', {bar: 'kekelar'}).should.equal('foo?bar=kekelar');
			util.makeConnectString('foo', {bar: 'kekelar', hai: 'bai'}).should.equal('foo?bar=kekelar&hai=bai');
		});
		it('should URL-escape query arguments', function () {
			util.makeConnectString('foo', {'bar%': '%'}).should.equal('foo?bar%25=%25');
		});
	});
	
	describe('.retry', function () {
		it('should call the function asynchronously', function (done) {
			var count = 0;
			
			util.retry(function () {
				count++;
				done();
			}, 10, 10);
			
			count.should.equal(0);
		});
		it('should honor the delay and max arguments', function (done) {
			var now = Date.now(),
				calls = 0;
			
			util.retry(function () {
				calls++;
				if (calls == 5) {
					(Date.now() - now).should.be.within(95, 105);
					done();
				} else {
					if (calls == 2) {
						(Date.now() - now).should.be.within(15, 25);
					}
					throw new Error();
				}
			}, 20, 20);
		});
	});
});
