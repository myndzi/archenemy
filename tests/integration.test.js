'use strict';

var when = require('when'),
	assert = require('assert'),
	should = require('should'),
	config = require('../config'),
	ArchEnemy = require('..');

describe('Integration tests', function () {
	it('should not suck', function (done) {
		var client = new ArchEnemy.Client({
			connection: {
				url: config.amqp,
				params: { heartbeat: 10 }
			}
		});
		
		var batcher = new ArchEnemy.Batcher(function (batch) {
			this.resolve();
		}, { maxSize: 1 });
		

		client.consume({
			'bar': [ 'foo' ]
		}, function (msg) {
			msg.should.equal('message');
			return batcher.add(msg).then(function () {
				client.send('keke', 'success');
			});
		});

		client.consume({
			'keke': [ 'keke' ]
		}, function (msg) {
			msg.should.equal('success');
			client.close().then(done.bind(null, null));
		});

		client.send('foo', 'message');
	});
});
