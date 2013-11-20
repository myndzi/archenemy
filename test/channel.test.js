'use strict';

var mock = require('./mock'),
	when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..');

when.delay = require('when/delay');

describe('Channel', function () {
	var connMock = mock();
	connMock.expect('createChannel', function () { return when.delay(10).yield(chanMock); });
	connMock.expect('close', function () { return when.delay(10).yield(this); });
	connMock.expect('whenConnected', function (cb) { when.delay(10).then(cb); });
	connMock.location = 'conn.channel.test.js';
	
	var chanMock = mock();
	chanMock.expect('assertExchange', function () { return when.delay(10); });
	chanMock.expect('assertQueue', function (name) { return when.delay(10).yield(name || 'foo'); });
	chanMock.expect('bindQueue', function () { return when.delay(10); });
	chanMock.expect('close', function () { return when.delay(10).yield(this); });
	chanMock.location = 'chan.channel.test.js';
	
	var Channel = ArchEnemy.Channel,
		chan = new Channel({
			connection: connMock,
			binding: {
				exchange: 'test',
				pattern: '*'
			}
		});
	
	it('should emit "connected" event', function (done) {
		chan.once('connected', done);
		chan.connect();
	});
	
	it('should not try to connect if already connected', function (done) {
		chanMock.expect('connect', function () {
			throw new Error();
		});
		chan.once('disconnected', function foo() {
			connMock.unexpect('connect');
		});
		
		when.delay(30).then(done);
	});
	it('should reconnect on disconnection', function (done) {
		chan.once('connected', done);
		
		chanMock.unexpect('connect');
		chanMock.emit('close');
	});
	it('should not reconnect on .disconnect()', function (done) {
		chan.once('connected', function () { throw new Error(); });
		chan.disconnect();
		chan.connected.should.equal(false);
		
		when.delay(30).then(function () {
			chan.removeAllListeners('connected');
		}).ensure(done);
	});
	it('should have proxy methods', function () {
		chan.proxies.length.should.be.above(0);
	});
	it('should disconnect proxies when disconnected', function () {
		chan.proxies[0].isConnected().should.equal(false);
	});
	it('should connect proxies when connected', function (done) {
		chan.once('connected', function () {
			chan.proxies[0].isConnected().should.equal(true);
			done();
		});
		chan.connect();
	});
});

