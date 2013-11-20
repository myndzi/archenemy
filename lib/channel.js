'use strict';

var util = require('./common'),
	when = require('when'),
	msgpack = require('msgpack'),
	extend = require('jquery-extend'),
	Logger = require('logger');

module.exports = Channel;

var defaults = {
	log: new Logger('Channel', 'trace'),
	proxyMethods: [
		'assertExchange',
		'assertQueue',
		'bindQueue',
		'publish'
	],
	exchangeOpts: { },
	queueOpts: { expires: 2 * 86400 * 1000 }
};

function Channel(opts) {
	var self = this;
	
	util.EventEmitter.call(self);
	
	opts = extend(defaults, opts);
	
	if (!opts.connection) throw new Error('opts.connection is required');
	
	self.log = opts.log;
	self.connection = opts.connection;
	self.binding = extend({
		exchangeOpts: defaults.exchangeOpts,
		queueOpts: defaults.queueOpts
	}, opts.binding);
	self.queue = '';
	
	self.proxies = [];
	opts.proxyMethods.forEach(function (methodName) {
		self.log.trace('binding proxy method: ', methodName);
		var proxy = util.queuedProxy(function () {
			// the object pointed to by 'self.conn' will change when we reconnect
			// we need to make sure we're using the most current one, thus the
			// extra wrapper

			self.chan[methodName].apply(self.chan, arguments);
		});
		self.proxies.push(proxy);
		self[methodName] = proxy;
	});
	self.consume = util.queuedProxy(function (callback, thisArg) {
		// these should always succeed
		if (self.queue === '') throw new Error('No queue name given??');
		if (self.chan === util.noObj) throw new Error('No channel??');
		
		self.chan.consume(self.queue, function (content, fields, properties) {
			callback.call(thisArg || self.chan, msgpack.unpack(content), fields, properties);
		});
	});
	self.proxies.push(self.consume);
	
	self.onDisconnect();
}
util.emitter(Channel);

Channel.prototype.onDisconnect = function (emit) {
	var self = this;
	
	self.chan = util.noObj;
	self.connected = false;
	self.proxies.forEach(function (proxy) {
		proxy.disconnect();
	});
	if (emit) self.emit('disconnected');
};
Channel.prototype.onConnect = function (chan) {
	var self = this;
	
	self.chan = chan;
	self.connected = true;
	
	chan.once('error', self.log.error);
	chan.once('close', function () {
		self.log.info('Channel closed');
		self.onDisconnect(true);
		util.retry(self.connect.bind(self));
	});
	
	self.proxies.forEach(function (proxy) { proxy.connect(); });
	
	self.emit('connected');
};
Channel.prototype.connect = function () {
	var self = this;
	if (self.connected) return self;
	
	self.connection.whenConnected(function () {
		self.connection.createChannel()
		.then(function (chan) {
			return self.init(chan)
			.then(self.onConnect.bind(self, chan));
		}).otherwise(function (err) {
			self.log.trace('Channel.connect failed: ', err);
			process.exit();
			util.retry(self.connect.bind(self));
		});
	});
	return self;
};
Channel.prototype.disconnect = function () {
	var self = this;
	
	if (!self.connected) {
		self.log.silly('Channel.disconnect called, but already disconnected');
		return when.resolve(self);
	}
	
	self.log.trace('Channel.disconnect()');
	var ret = self.chan.close().then(function () {
		self.log.trace('Channel.disconnection succeeded');
	});
	self.onDisconnect();
	return ret;
};
Channel.prototype.init = function (chan) {
	var self = this,
		binding = self.binding;

	self.log.trace('Channel.init');
	if (!binding.exchange || binding.exchange === '') {
		self.log.silly('No exchange given');
		return when.resolve(chan);
	}

	return chan.assertExchange(binding.exchange, 'topic')
	.then(function () {
		self.log.trace('assertExchange succeeded');
		return chan.assertQueue(binding.queue);
	})
	.then(function (queue) {
		self.log.trace('assertQueue succeeded: ', queue);
		self.queue = queue.queue;
		
		if (Array.isArray(binding.patterns)) {
			return when.all(binding.patterns.map(function (pattern) {
				return chan.bindQueue(
					self.queue,
					binding.exchange,
					pattern,
					binding.args
				);
			}));
		} else if (binding.patterns) {
			return chan.bindQueue(
				self.queue,
				binding.exchange,
				binding.patterns,
				binding.args
			);
		}
	});
};
Channel.prototype.destroy = function () {
	var self = this,
		chan = self.chan,
		binding = self.binding;
	
	if (!self.connected)
		return when.reject(new Error('Channel.destroy called, but not connected'));
	
	self.log.trace('Channel.destroy()');
	self.queue = queue;
	
	if (Array.isArray(binding.patterns)) {
		return when.all(binding.patterns.map(function (pattern) {
			return self.chan.unbindQueue(
				queue,
				binding.exchange,
				pattern,
				binding.args
			);
		})).then(self.chan.deleteQueue.bind(self.chan, self.queue))
		.then(self.close.bind(self));
	} else {
		return self.chan.unbindQueue(
			queue,
			binding.exchange,
			binding.patterns,
			binding.args
		).then(self.chan.deleteQueue.bind(self.chan, self.queue))
		.then(self.close.bind(self));
	}
};
