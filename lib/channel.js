'use strict';

var util = require('./common'),
	when = require('when'),
	msgpack = require('msgpack'),
	extend = require('jquery-extend'),
	Logger = require('logger');

when.fn = require('when/function');

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
	bindings: null,
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
	self.queues = [ ];
	
	self.log.trace('('+self.id+') new Channel', {
		exchange: [ opts.exchange, opts.exchangeOpts ],
		queueOpts: opts.queueOpts,
		bindingOpts: opts.bindingOpts,
		bindings: opts.bindings,
		proxyMethods: opts.proxyMethods
	});
	
	self.proxies = [ ];
	opts.proxyMethods.forEach(function (methodName) {
		var proxy = util.queuedProxy(function () {
			// the object pointed to by 'self.chan' will change when we reconnect
			// we need to make sure we're using the most current one, thus the
			// extra wrapper

			var res = self.chan[methodName].apply(self.chan, arguments);
		});
		self.proxies.push(proxy);
		self[methodName] = proxy;
	});
	
	self.consume = util.queuedProxy(function (/*queues, callback, errback*/) {
		if (self.chan === util.noObj) {
			// this should only run after proxies have connected,
			// which happens when a channel is opened
			throw new Error('BUG: No channel object');
		}
		
		var args = util.convertArgs(arguments),
			queues, callback, errback;
		
		if (typeof args[0] === 'object') queues = args.shift();
		else queues = self.queues

		if (typeof args[0] === 'function') callback = args.shift();
			
		if (typeof args[0] === 'function') errback = args.shift();
		
		
		return when.all(queues.map(function (queue) {
			return self.chan.consume(queue, function (msg) {
				var ack = self.chan.ack.bind(self.chan, msg),
					nack = self.chan.nack.bind(self.chan, msg),
					parsed = msgpack.unpack(msg.content),
					deferred = when.defer();
				
				// make the raw message and parsed message available on 'this' in callbacks
				extend(deferred, {
					raw: msg,
					parsed: parsed
				});
				
				when(
					when.fn.call(function () {
						// can return a value, another promise, or call this.resolve / this.reject
						var res = callback.call(deferred, parsed);
						if (res) deferred.resolve(res);
					}).otherwise(function (err) {
						// no error handler = fail
						if (!errback) deferred.reject(err);
						// error handler = it's out of our hands now
						else errback.call(deferred, err);
					})
				).otherwise(function (err) {
					// uncaught error, but we ack the message anyway so we don't wind up in an infinite loop
					self.log.error('Client.consume: fatal error', 'REMOVING FROM QUEUE', err);
				}).ensure(ack);
			});
		}));
	});
	self.proxies.push(self.consume);
	
	self.publish = util.queuedProxy(function (exchange, routingKey, content, headers) {
		if (self.chan === util.noObj) {
			// this should only run after proxies have connected,
			// which happens when a channel is opened
			throw new Error('BUG: No channel object');
		}

		if (routingKey instanceof Buffer) {
			headers = content;
			content = routingKey;
			routingKey = exchange;
			exchange = self.exchange;
		} else if (!(content instanceof Buffer)) {
			self.log.error('Content must be a buffer', arguments);
			return;
		}
		
		if (!exchange) { throw new Error('Exchange is undefined again >:('); }
		
		self.chan.publish(exchange, routingKey, content, { headers: headers });
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
	
	return chan.assertExchange(opts.exchange, opts.exchangeType || 'topic', opts.exchangeOpts)
	.then(function () {
		self.log.trace('('+self.id +') assertExchange succeeded: '+ opts.exchange);
	})
	.then(function () {
		if (opts.bindings === null) {
			return chan.assertQueue('', opts.queueOpts).then(function (res) {
				var returnedQueue = res.queue;
				self.log.trace('('+self.id +') assertQueue succeeded: '+ returnedQueue);
				self.queues.push(returnedQueue);
				return when.resolve(opts);
			});
		}
		var promises = [];
		Object.keys(opts.bindings).forEach(function (queue) {
			var patterns = opts.bindings[queue],
				thisOpts = { };
				
			if (!Array.isArray(patterns)) patterns = [ patterns ];
			if (queue === '') thisOpts.autoDelete = true;
				
			promises.push(
				chan.assertQueue(queue, extend(thisOpts, opts.queueOpts)).then(function (res) {
					var returnedQueue = res.queue;
					self.log.trace('('+self.id +') assertQueue succeeded: '+ returnedQueue);
					self.queues.push(returnedQueue);

					return when.all(
						patterns.map(function (pattern) {
							self.log.trace([opts.exchange, pattern, returnedQueue].join(' -> '));
							return chan.bindQueue(
								returnedQueue,
								opts.exchange,
								pattern,
								opts.bindOpts
							);
						})
					);
				})
			);
		});

		return when.all(promises).yield(opts);
	}).otherwise(self.log.error);
};
Channel.prototype.destroy = function () {
	var self = this,
		chan = self.chan,
		opts = self.opts;
	
	if (!self.connected)
		return when.reject(new Error('Channel.destroy called, but not connected'));
	
	self.log.trace('Channel.destroy()');
	
	self.queues.forEach(self.chan.deleteQueue.bind(self.chan))
	self.queues = [ ];
};
