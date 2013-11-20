'use strict';

var when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..');

describe('Integration tests', function () {
	var client = new ArchEnemy.Client({
		connection: {
			url: 'amqp://yvft:UauCCz2H95fkSzkvDb5Tgr7J@yvft.com',
			params: { heartbeat: 10 }
		}
	});
	it('should wait a bit', function (done) {
	});
});
