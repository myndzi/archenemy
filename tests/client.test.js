'use strict';

var mock = require('./mock'),
	when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..');

when.delay = require('when/delay');

describe('Client', function () {
	var chanMock = new mock();
	chanMock.expect('assertExchange', function () { return when.delay(10); });
	chanMock.expect('assertQueue', function (name) { return when.delay(10).yield(name || 'foo'); });
	chanMock.expect('bindQueue', function () { return when.delay(10); });
	chanMock.expect('close', function () { return when.delay(10).yield(this); });
	chanMock.expect('consume', function () { });
	chanMock.expect('connect', function () { return when.delay(10).yield(this); });
	chanMock.location = 'chan.client.test.js';

	var connMock = new mock();
	connMock.expect('connect', function () {});
	connMock.expect('createChannel', function () { return when.delay(10).yield(chanMock); });
	connMock.expect('close', function () { return when.delay(10).yield(this); });
	connMock.expect('whenConnected', function (cb) { when.delay(10).then(cb); });
	connMock.location = 'conn.client.test.js';
		
	var amqpMock = new mock();
	amqpMock.expect('connect', function () { return when.delay(10).yield(connMock); });
	amqpMock.expect('close', function () { return when.delay(10).yield(this); });
	amqpMock.location = 'amqp.client.test.js';
	
	var client;
	
	describe('#consume', function () {
		var consumeChan, cb = function (a) { return typeof a === 'function'? a(): a; };
		it('should emit "initClient"', function (done) {
			client = new ArchEnemy.Client({
				Channel: function () { return chanMock },
				Connection: function () { return connMock },
				connection: { amqp: amqpMock }
			});
			chanMock.expect(chanMock, 'publish', done);
		});
		it('should return a promise resolved with a Channel instance', function (done) {
			client.consume(cb)
			.then(function (ch) {
				consumeChan = ch;
				chanMock.expect(1, 'foo', function () {
					done();
				});
				ch.foo();
			}).done(); // remember to throw errors!
		});
		it('should add the new channel to the internal list', function () {
			client.channels.length.should.equal(2);
		});
		it('should trigger the callback when receiving a message', function () {
			cb('foo').should.equal('foo');
		});
		it('should be able to destroy the channel', function (done) {
			chanMock.expect('destroy', function () { return when.delay(10).yield(this); });
			client.destroy(consumeChan, true).then(done.bind(null, null)).done();
		});
		it('should remove the channel from the internal list', function () {
			client.channels.length.should.equal(1);
		});		
	});
	describe('#send', function () {
		it('should call Channel.publish', function (done) {
			chanMock.expect('publish', done);
			client.send('foo', 'data');
		});
	});
	describe('#clientInfo', function () {
		it('should work', function () {
			client.clientInfo().should.be.ok;
		});
	});
});
