'use strict';

module.exports = queuedProxy;

// proxy calls to fn with queueing
function queuedProxy(callback, connected) {
	if (typeof callback !== 'function') throw new Error('queuedProxy requires a function');
	
	var queue = [], connected = connected ? true : false;
	
	var fn = function () {
		var self = this, args = arguments;
		if (!connected) {
			queue.push([self, args]);
		} else {
			process.nextTick(function () {
				callback.apply(self, args);
			});
		}
	};
	var doQueue = function () {
		queue.forEach(function (item) {
			callback.apply(item[0], item[1]);
		});
		queue = [];
	};
	fn.isConnected = function () { return connected; }
	fn.connect = function () { connected = true; process.nextTick(doQueue); };
	fn.disconnect = function () { connected = false; };
	return fn;
}
