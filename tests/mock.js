'use strict';
var EventEmitter = require('events').EventEmitter,
	util = require('util');

process.on('exit', function () {
	mocks.forEach(function (mock) {
		if (mock.expected && mock.calls < mock.expected) {
			console.log('Expected ' + mock.expected + ' calls but got ' + mock.calls + ':');
			console.log(mock.stack);
		}
	});
});
var mocks = [];

module.exports = Mock;

function Mock() {
	if (!(this instanceof Mock)) return new Mock();
	
	EventEmitter.call(this);
	this.mocks = { };
}
util.inherits(Mock, EventEmitter);

Mock.prototype.expect = function (calls, method, cb) {
	if (typeof method === 'function') {
		cb = method;
		method = calls;
		calls = null;
	}

	if (this[method]) {
		this.mocks[method] = (this.mocks[method] || []).concat(this[method]);
	}

	this[method] = mockFn(calls, cb, this, arguments);
};
Mock.prototype.unexpect = function (method) {
	if (this.mocks[method] && this.mocks[method].length)
		this[method] = this.mocks[method].pop();
};

function mockFn(expected, fn, thisArg, args) {
	var self = {};
	
	self.calls = 0;
	self.expected = expected;
	self.fnStr = String(fn);
	self.error = new Error('[Function: ' + (fn.name || 'anonymous') + ']');
	self.stack = (self.error).stack;
	mocks.push(self);
	
	return function () {
		if (self.expected && ++self.calls > self.expected) {
			self.error = new Error('[Function: ' + (fn.name || 'anonymous') + '] Called too many times (expected ' + self.expected + ', got ' + self.calls + '):\n');
			self.stack = (self.error).stack;
			throw self.error;
		}
		return fn.apply(thisArg, arguments);
	};
}
