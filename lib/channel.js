'use strict';

var util = require('./common'),
	when = require('when'),
	msgpack = require('msgpack'),
	extend = require('jquery-extend'),
	Logger = require('logger');

module.exports = Channel;

var defaults = {
	log: new Logger('Channel'),
	proxyMethods: [
		'assertExchange',
		'assertQueue',
		'bindQueue'
	],
	exchange: 'default',
	exchangeOpts: { },
	patterns: [],
	queueOpts: { expires: 2 * 86400 * 1000 }
};

var _id = 0;
function Channel(opts) {
	var self = this;
	
	util.EventEmitter.call(self);
	
	opts = extend({}, defaults, opts);
	
	if (!opts.connection) { throw new Error('opts.connection is required'); }
	
	self.id = ++_id;
	self.log = opts.log;
	self.connection = opts.connection;
	self.opts = opts;
	
	self.log.trace('('+self.id+') new Channel', {
		exchange: [ opts.exchange, opts.exchangeOpts ],
		queue: [ opts.queue, opts.queueOpts ],
		patterns: opts.patterns,
		proxyMethods: opts.proxyMethods
	});
	
	self.proxies = [];
	opts.proxyMethods.forEach(function (methodName) {
		var proxy = util.queuedProxy(function () {
			console.log('executing proxy function: ' + methodName, arguments);
			// the object pointed to by 'self.chan' will change when we reconnect
			// we need to make sure we're using the most current one, thus the
			// extra wrapper

			var res = self.chan[methodName].apply(self.chan, arguments);
		});
		self.proxies.push(proxy);
		self[methodName] = proxy;
	});
	
	self.consume = util.queuedProxy(function (callback, thisArg) {
		if (self.chan === util.noObj) {
			// this should only run after proxies have connected,
			// which happens when a channel is opened
			throw new Error('BUG: No channel object');
		}

		self.chan.consume(self.queue, function (msg) {
			callback.call({
				raw: msg,
				chan: self.chan,
				ack: self.chan.ack.bind(self.chan, msg),
				nack: self.chan.nack.bind(self.chan, msg)
			}, msgpack.unpack(msg.content));
		});
	});
	self.proxies.push(self.consume);
	
	self.publish = util.queuedProxy(function (exchange, routingKey, content) {
		if (self.chan === util.noObj) {
			// this should only run after proxies have connected,
			// which happens when a channel is opened
			throw new Error('BUG: No channel object');
		}
		if (content === undefined) {
			content = routingKey;
			routingKey = exchange;
			exchange = self.exchange;
		}

		self.chan.publish(exchange, routingKey, content);
	});
	self.proxies.push(self.publish);
	
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
Channel.prototype.onConnect = function (chan, opts) {
	var self = this;
	
	self.chan = chan;
	self.queue = opts.queue;
	self.exchange = opts.exchange;
	self.connected = true;
	
	chan.once('error', self.log.error);
	chan.once('close', function () {
		self.log.info('Channel closed');
		self.onDisconnect(true);
		util.retry(self.connect.bind(self));
	});
	
	self.log.trace('('+self.id +') Connecting proxies...');
	self.proxies.forEach(function (proxy) { proxy.connect(); });	
	self.emit('connected');
};
Channel.prototype.connect = function () {
	var self = this;
	if (self.connected) return self;
	
	var opts = self.opts;
	self.connection.whenConnected(function () {
		self.connection.createChannel()
		.then(function (chan) {
			return self.init(chan, opts)
			.then(function (opts) {
				return self.onConnect(chan, opts);
			});
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
Channel.prototype.init = function (chan, opts) {
	var self = this;
	
	self.log.trace('('+self.id +') Channel.init()');
	
	if (!opts.exchange) {
		self.log.warn('BUG: No exchange specified', (new Error).stack);
		return;
	}
	
	return chan.assertExchange(opts.exchange, 'topic', opts.exchangeOpts)
	.then(function () {
		self.log.trace('('+self.id +') assertExchange succeeded: '+ opts.exchange);
		return chan.assertQueue(opts.queue, opts.queueOpts);
	})
	.then(function (res) {
		self.log.trace('('+self.id +') assertQueue succeeded: '+ res.queue);
		opts.queue = res.queue;
		
		if (Array.isArray(opts.patterns)) {
			return when.all(opts.patterns.map(function (pattern) {
				self.log.trace([opts.exchange, pattern, opts.queue].join(' -> '));
				return chan.bindQueue(
					opts.queue,
					opts.exchange,
					pattern,
					opts.args
				);
			}));
		} else if (opts.patterns) {
			self.log.trace([opts.exchange, opts.patterns, opts.queue].join(' -> '));
			return chan.bindQueue(
				opts.queue,
				opts.exchange,
				opts.patterns,
				opts.args
			);
		}
	})
	.yield(opts)
	.otherwise(self.log.error);
};
Channel.prototype.destroy = function () {
	var self = this,
		chan = self.chan,
		opts = self.opts;
	
	if (!self.connected)
		return when.reject(new Error('Channel.destroy called, but not connected'));
	
	self.log.trace('Channel.destroy()');
	self.queue = queue;
	
	if (Array.isArray(opts.patterns)) {
		return when.all(opts.patterns.map(function (pattern) {
			return self.chan.unbindQueue(
				queue,
				opts.exchange,
				pattern,
				opts.args
			);
		})).then(self.chan.deleteQueue.bind(self.chan, self.queue))
		.then(self.close.bind(self));
	} else {
		return self.chan.unbindQueue(
			queue,
			opts.exchange,
			opts.patterns,
			opts.args
		).then(self.chan.deleteQueue.bind(self.chan, self.queue))
		.then(self.close.bind(self));
	}
};
