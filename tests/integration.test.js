'use strict';

var when = require('when'),
	assert = require('assert'),
	should = require('should'),
	config = require('../config'),
	ArchEnemy = require('..');

describe('Integration tests', function () {
	var client = new ArchEnemy.Client({
		connection: {
			url: config.amqp,
			params: { heartbeat: 10 }
		}
	});
	it('should wait a bit', function (done) {
		client.close().ensure(done);
	});
});
