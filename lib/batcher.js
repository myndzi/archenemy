'use strict'

var Logger = require('logger'),
	when = require('when'),
	extend = require('jquery-extend'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter;

when.fn = require('when/function');

var log = new Logger('Batcher');

module.exports = Batcher;

var defaults = {
	timeout: 10*1000,
	execTimeout: 30*1000,
	minSize: 0,
	maxSize: Infinity
};

function Batcher(fn, opts) {
	if (typeof fn !== 'function') throw new Error('Batcher requires a function!');
	opts = extend({ }, defaults, opts);
	
	EventEmitter.call(this);

	log.trace('new Batcher()', opts);
	this.timeout = opts.timeout;
	this.execTimeout = opts.execTimeout;
	this.minSize = opts.minSize;
	this.maxSize = opts.maxSize;
	this.fn = fn;
	this.batch = [ ];
	this.timer = null;
}
util.inherits(Batcher, EventEmitter);
Batcher.prototype.add = function () {
	log.trace('Batcher.add()');
	var deferred = when.defer();
	var item = {
		deferred: deferred,
		data: arguments.length === 1 ?
			arguments[0] :
			Array.prototype.slice.call(arguments)
	};
	
	this.batch.push(item);
	log.trace('Pushing item (' + this.batch.length + ' total)');

	this.checkReady();
	return deferred.promise;
};
Batcher.prototype.checkReady = function () {
	if (this.batch.length === 0) return;
	log.trace('Batcher.checkReady', [ this.minSize, this.batch.length, this.maxSize ]);
	if (this.batch.length >= this.maxSize) {
		log.trace('(reached maxSize)');
		this.execute();
	} else if (this.batch.length >= this.minSize) {
		log.trace('(reached minSize)');
		if (!this.timer) {
			log.trace('Setting timeout for ' + this.timeout + 'ms');
			this.timer = setTimeout(this.execute.bind(this), this.timeout);
		}
	}
};
Batcher.prototype.execute = function () {
	log.trace('Batcher.execute()');
	var self = this;
	
	var batch = this.batch.splice(0, this.maxSize);
	
	if (this.timer) {
		log.trace('Clearing timeout (executing)');
		clearTimeout(this.timer);
		this.timer = null;
	}
	process.nextTick(this.checkReady.bind(this));
	
	var timer;
	
	log.trace('Starting exec timeout (' + this.execTimeout + 'ms)');
	timer = setTimeout(function () {
		timer = null;
		self.emit('timeout', batch);
		log.warn('warning: timeout expired but batch has not been concluded');
	}, this.execTimeout);
	
	var batchResolve = {
		resolve: function (res) {
			log.trace('batch resolve');
			return when.settle(batch.map(function (a) {
				a.deferred.resolve(res);
				return a.deferred.promise;
			}));
		},
		reject: function (err) {
			log.trace('batch reject');
			return when.settle(batch.map(function (a) {
				a.deferred.reject(err);
				return a.deferred.promise;
			}));
		}
	};
	
	when.fn.call(this.fn.bind(batchResolve, batch))
	.otherwise(function (err) {
		try {
			var res = self.emit('error', err);
		} catch (err) {
			log.warn('function threw: ', err);
		}
		batchResolve.reject();
	});
	
	when.settle(batch.map(function (a) {
		return a.deferred.promise;
	})).then(function () {
		if (timer === null) log.warn('batch concluded but after timeout');
		else {
			log.silly('batch concluded');
			self.emit('done', batch);
		}
	}).ensure(function () {
		log.trace('Clearing exec timeout');
		clearTimeout(timer);
	});
};
