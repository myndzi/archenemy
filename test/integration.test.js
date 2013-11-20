'use strict';

var when = require('when'),
	assert = require('assert'),
	should = require('should'),
	ArchEnemy = require('..');

describe('Integration tests', function () {
	var client = new ArchEnemy.Client({
		connection: {
			url: '',
			params: { heartbeat: 10 },
			log: new (require('logger'))('connection', 'trace')
		},
		log: new (require('logger'))('client', 'trace')
	});
	it('should wait a bit', function (done) {
	});
});
