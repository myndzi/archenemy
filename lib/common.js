'use strict';
var when = require('when'),
	whenFn = require('when/function'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter;

module.exports = {
	makeConnectString: function makeConnectString(url, params) {
		if (!url) url = 'amqp://localhost';
		var query = [];
		if (params) {
			Object.keys(params).forEach(function (key) {
				query.push(encodeURIComponent(key)+'='+encodeURIComponent(params[key]));
			});
			return url + '?' + query.join('&');
		}
		else return url;
	},
	retry: function retry(fn, dly, max) {
		if (typeof fn !== 'function') throw new Error('No function supplied');
		
		var tryOnce = function () {
			setTimeout(function () {
				whenFn.call(fn).otherwise(function () {
					dly = Math.min(dly * 2, max);
					tryOnce();
				});
			}, dly);
		}

		process.nextTick(tryOnce);
	},
	convertArgs: function convertArgs(a, offs) { return Array.prototype.slice.call(a, offs || 0); },
	EventEmitter: EventEmitter,
	emitter: function (fn) { util.inherits(fn, EventEmitter); },
	inspect: util.inspect,
	queuedProxy: require('queuedproxy')
};
