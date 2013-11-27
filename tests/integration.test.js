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
			batch[0].deferred.resolve('kittens');
			return 'batch result';
		}, { execTimeout: 100, maxSize: 1 });
		

		client.consume({
			'bar': [ 'foo' ]
		}, function (msg) {
			msg.should.equal('message');
			return batcher.add(msg).then(function (res) {
				client.send('keke', 'success');
				return res;
			});
		});

		var closing = false;
		client.consume({
			'keke': [ 'keke' ]
		}, function (msg) {
			msg.should.equal('success');
		});
		
		client.consume({
			'unf': [ 'unf' ]
		}, function (msg) {
			msg.should.equal('kittens');
			this.headers.fromKey.should.equal('foo');
			this.headers['content-type'].should.equal('test message');
			
			if (closing) return;
			closing = true;
			setTimeout(function () {
				client.close().then(done.bind(null, null));
			}, 100);
		});

		client.send('foo', 'message')
			.then('unf', { 'content-type': 'test message' });
	});
});
