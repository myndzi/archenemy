'use strict';

var os = require('os'),
	when = require('when'),
	util = require('./common'),
	msgpack = require('msgpack'),
	extend = require('jquery-extend'),
	Logger = require('logger');

module.exports = Client;

var defaults = {
	exchange: 'default',
	log: new Logger('Client'),
	Channel: require('./channel'),
	Connection: require('./connection')
};

function Client(opts) {
	var self = this;
	
	//util.EventEmitter.call(self);
	
	opts = extend({}, defaults, opts);
	
	self.Connection = opts.Connection;
	self.Channel = opts.Channel;
	self.log = opts.log;
	self.closing = false;
	
	if (!opts.connection) throw new Error('opts.connection is required');
	
	if (typeof opts.connection === 'function') {
		self.log.trace('Taking opts.connection as-is');
		self.connection = opts.connection;
	} else if (opts.connection instanceof Client) {
		self.log.trace('Inheriting connection from existing Client');
		self.connection = opts.connection.connection;
	} else {
		self.log.trace('Creating a new connection');
		self.connection = new self.Connection(opts.connection);
	}

	self.uuid = self.connection.uuid;
	self.channels = [];
	
	self.init(opts);
}
//util.emitter(Client);

Client.prototype.init = function (opts) {
	var self = this;
	
	self.log.trace('Client.init');
	
	self.connection.connect();
	
	self.defaultExchange = opts.exchange;
	
	self.defaultChan = new self.Channel({
		exchange: opts.exchange,
		connection: self.connection
	});
	self.defaultChan.connect();
	
	var bindings = { };
	bindings[self.uuid] = [ '*.*.' + self.uuid ];
	
	self.consume('control', bindings, function (content, fields, properties) {
		self.log.silly('Received control message: ', content, fields, properties);
	});
	
	process.nextTick(self.emit.bind(self, 'initClient', self.clientInfo()));
};

Client.prototype.consume = function (/*exchange, bindings, callback, errback*/) {
	var self = this, callback, errback, opts = { },
		args = util.convertArgs(arguments);
	
	if (typeof args[1] === 'object') {
		if (typeof args[0] === 'string') { 
			opts.exchange = args.shift();
		} else {
			opts = args.shift();
		}
		opts.bindings = args.shift();
	} else if (typeof args[0] !== 'function') {
		if (typeof args[0] === 'string') {
			opts.exchange = args.shift();
		} else {
			opts.bindings = args.shift();
		}
	}
	
	opts = extend({
		connection: self.connection,
		exchange: self.defaultExchange
	}, opts);

	
	if (typeof args[0] === 'function') { callback = args.shift(); }
	else {
		self.log.error('Client.consume(): No callback supplied');
		return when.reject('No callback supplied');
	}
	
	if (typeof args[0] === 'function') { errback = args.shift(); }
	else { errback = util.noOp; }

	var chan = new self.Channel(opts);
	
	self.channels.push(chan);
	chan.consume(callback, errback);
	
	chan.connect();	
	
	return when.resolve(chan);
};
Client.prototype.send = function (routingKey, content, headers) {
	// provide 'then' methods to build a chain of services?
	this.log.trace('-> ' + routingKey, content);
	var obj = {
		routingKey: routingKey,
		content: msgpack.pack(content),
		headers: extend({
			fromKey: routingKey
		}, headers)
	}, stack = [obj], self = this;
	
	var pp = { then: function (routingKey, headers) {
		var obj = {
			routingKey: routingKey,
			headers: extend({ }, headers)
		};
		stack.push(obj);
		return pp;
	} };
	process.nextTick(function () {
		var args = stack.shift();
		args.headers.stack = stack;
		self.defaultChan.publish(
			args.routingKey,
			args.content,
			args.headers
		);
	});
	return pp;
};
Client.prototype.emit = function (event, data) {
	this.send('events', event+'.'+this.uuid, data);
};
Client.prototype.query = function () {
	var self = this,
		deferred = when.defer();
	
	var replyChan = self.consume(function (content, fields, properties) {
		deferred.resolve([content, fields, properties]);
		this.destroy().otherwise(self.log.warn);
	});
		
	return deferred.promise;
};
Client.prototype.close = function () {
	if (this.closing) {
		this.log.warn('Client.close called, but already closing!');
	}
	var self = this, deferred = when.defer();
	self.closing = true;
	self.log.trace('Client.close()');
	process.nextTick(function () {
		deferred.resolve(self.connection.close());
	});
	return deferred.promise;
};
Client.prototype.destroy = function (channel, test) {
	var self = this;

	if (!test && !(channel instanceof self.Channel))
		return when.reject(new Error('Must supply a Channel instannce to destroy'));

	var idx = self.channels.indexOf(channel);
	
	if (idx === -1)
		return when.reject(new Error('Channel isn\'t in active channels list!'));
	
	self.channels.splice(idx, 1);

	return channel.destroy();
};
Client.prototype.clientInfo = function () {
	return {
		hostname: os.hostname(),
		type: os.type(),
		platform: os.platform(),
		release: os.release(),
		arch: os.arch(),
		uptime: os.uptime(),
		loadavg: os.loadavg(),
		totalmem: os.totalmem(),
		freemem: os.freemem(),
		cpus: os.cpus(),
		networkInterfaces: os.networkInterfaces()
	};
};
