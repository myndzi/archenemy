"use strict";

var when = require('when'),
	uuid = require('thisid'),
	util = require('./common'),
	Logger = require('logger'),
	extend = require('jquery-extend');

module.exports = Connection;

var defaults = {
	uuid: uuid,
	url: 'amqp://localhost',
	params: { heartbeat: 10 },
	amqp: require('amqplib'),
	proxyMethods: [
		'createChannel'
	],
	log: new Logger('Connection')
};

function Connection(opts) {
	var self = this;
	
	util.EventEmitter.call(self);
	
	opts = extend(defaults, opts);

	self.uuid = opts.uuid;
	self.log = opts.log;
	self.queue = [];
	self.amqp = opts.amqp;
	self.socketOpts = opts.socketOpts;
	self.connectString = util.makeConnectString(self.url, self.params);

	self.proxies = [];
	opts.proxyMethods.forEach(function (methodName) {
		self.log.trace('binding proxy method: ', methodName);
		var proxy = util.queuedProxy(function () {
			// the object pointed to by 'self.conn' will change when we reconnect
			// we need to make sure we're using the most current one, thus the
			// extra wrapper
			self.conn[methodName].apply(self.conn, arguments);
		});
		self.proxies.push(proxy);
		self[methodName] = proxy;
	});
	
	self.onDisconnect();
}
util.emitter(Connection);

Connection.prototype.onDisconnect = function (emit) {
	var self = this;
	
	self.conn = util.noObj;
	self.connected = false;
	// add a test for self
	self.proxies.forEach(function (proxy) {
		proxy.disconnect();
	});
	if (emit) self.emit('disconnected');
};
Connection.prototype.onConnect = function (conn) {
	var  self = this;
	
	self.conn = conn;
	self.connected = true;
	
	conn.once('error', self.log.error);
	conn.once('close', function () {
		self.log.info('Connection closed');
		self.onDisconnect(true);
		util.retry(self.connect.bind(self));
	});

	self.proxies.forEach(function (proxy) { proxy.connect(); });
	
	self.emit('connected');
};
Connection.prototype.connect = function () {
	var self = this;
	if (self.connected) return self;

	self.amqp.connect(
		self.connectString,
		self.socketOpts
	).then(function (conn) {
		self.onConnect(conn);
	}).otherwise(function () {
		util.retry(self.connect.bind(self));
	});
	return self;
};
Connection.prototype.disconnect = function () {
	var self = this;
	
	if (!self.connected) {
		self.log.silly('Connection.disconnect called, but already disconnected');
		return when.resolve(self);
	}
	
	self.log.trace('Connection.disconnect()');
	var ret = self.conn.close().then(function () {
		self.log.trace('Connection.disconnection succeeded');
	});
	self.onDisconnect();
	return ret;
};
