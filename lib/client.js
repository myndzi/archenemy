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
	
	opts = extend(defaults, opts);
	
	self.Connection = opts.Connection;
	self.Channel = opts.Channel;
	self.log = opts.log;
	
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
	
	self.init();
}
//util.emitter(Client);

Client.prototype.init = function () {
	var self = this;
	
	self.log.trace('Client.init');
	
	self.connection.connect();
	
	self.defaultChan = new self.Channel({
		connection: self.connection
	});
	self.defaultChan.connect();
	
	self.consume({
		exchange: 'control',
		queue: self.uuid,
		patterns: [
			'*.*.'+self.uuid
		]
	}, function (content, fields, properties) {
		self.log.silly('Received control message: ', content, fields, properties);
	});
	
	process.nextTick(self.emit.bind(self, 'initClient', self.clientInfo()));
};
Client.prototype.consume = function (opts, callback) {
	var self = this;
	
	if (typeof opts === 'function') {
		callback = opts;
		opts = { };
	}
	if (typeof callback !== 'function') return when.reject('No callback supplied');
	
	opts.exchange = opts.exchange || self.exchange;
	
	var chan = new self.Channel({
		connection: self.connection,
		binding: opts
	});

	self.channels.push(chan);
	chan.consume(callback);
	
	chan.connect();	
	
	return when.resolve(chan);
};
Client.prototype.send = function (routingKey, content) {
	this.defaultChan.publish(this.exchange, routingKey, msgpack.pack(content));
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
	var self = this;
	return self.connection.close();
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
