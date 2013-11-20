'use strict';

var mock = require('./mock'),
	when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..');

when.delay = require('when/delay');

describe('Connection', function () {
	var amqpMock = mock();
	amqpMock.expect('connect', function () { return when.delay(10).yield(this); });
	amqpMock.expect('close', function () { return when.delay(10).yield(this); });
	
	var Connection = ArchEnemy.Connection,
		conn = new Connection({amqp: amqpMock});
	
	it('should emit "connect" event', function (done) {
		conn.once('connected', done);
		conn.connect();
	});
	it('should not try to connect if already connected', function (done) {
		amqpMock.expect('connect', function () {
			throw new Error();
		});
		conn.once('disconnected', function foo() {
			amqpMock.unexpect('connect');
		});
		
		when.delay(30).then(done);
	});
	it('should reconnect on disconnection', function (done) {
		conn.once('connected', done);
		
		amqpMock.unexpect('connect');
		amqpMock.emit('close');
	});
	it('should not reconnect on .disconnect()', function (done) {
		conn.once('connected', function () { throw new Error(); });
		conn.disconnect();
		conn.connected.should.equal(false);
		
		when.delay(30).then(function () {
			conn.removeAllListeners('connected');
		}).ensure(done);
	});
	it('should have proxy methods', function () {
		conn.proxies.length.should.be.above(0);
	});
	it('should disconnect proxies when disconnected', function () {
		conn.proxies[0].isConnected().should.equal(false);
	});
	it('should connect proxies when connected', function (done) {
		conn.once('connected', function () {
			conn.proxies[0].isConnected().should.equal(true);
			done();
		});
		conn.connect();
	});
});

