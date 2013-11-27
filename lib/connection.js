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
	log: new Logger('Connection')
};

function Connection(opts) {
	var self = this;
	
	util.EventEmitter.call(self);
	
	opts = extend({}, defaults, opts);

	self.uuid = opts.uuid;
	self.log = opts.log;
	self.queue = [];
	self.amqp = opts.amqp;
	self.socketOpts = opts.socketOpts;
	self.closing = false;
	self.connectString = util.makeConnectString(opts.url, opts.params);

	var ccProxy = util.queuedProxy(function (deferred) {
		return when(self.conn.createChannel(), deferred.resolve, deferred.reject);
	});
	var whenConnected = util.queuedProxy(function (cb) { cb(); });
	self.whenConnected = whenConnected;
	self.proxies = [ ccProxy, whenConnected ];
	
	self.createChannel = function () {
		self.log.trace('Connection.createChannel()');
		var deferred = when.defer();
		ccProxy(deferred);
		return deferred.promise;
	};
	
	self.onDisconnect();
}
util.emitter(Connection);

Connection.prototype.close = function () {
	var self = this;

	if (self.connected) {
		self.log.silly('closing immediately');
		self.closing = when.resolve();
		self.conn.removeAllListeners();
		return self.conn.close();
	} else if (self.closing) {
		// already in progress
		self.log.silly('delayed close');
		self.conn.removeAllListeners();
		return self.closing();
	} else {
		// close was called before the connection finished opening;
		// this shouldn't happen usually, but we don't want the
		// connection to be open after we assume it's closed so
		// we wait for a connection and then close it
		self.log.silly('waiting for connect');
		
		var deferred = when.defer();
		self.once('connected', function () { deferred.resolve(self.close(conn)); });
		return deferred.promise();
	}
};
Connection.prototype.onDisconnect = function (emit) {
	var self = this;
	
	self.log.trace('Connection.onDisconnect()');
	
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
	
	self.log.trace('Connection.onConnect()');
	
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
	self.log.trace('Connection.connect()', self.connectString, self.socketOpts);
	
	if (self.connected) {
		self.log.warn('Connection.connect called but already connected!');
		return self;
	}

	self.amqp.connect(
		self.connectString,
		self.socketOpts
	).then(function (conn) {
		if (self.closing) {
			self.closing.resolve(conn);
		} else {
			self.onConnect(conn);
		}
	}).otherwise(function (err) {
		self.log.warn(err);
		process.exit();
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
