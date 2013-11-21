var Mocha = require('mocha'),
	fs = require('fs'),
	path = require('path');
	
argv = require('optimist')
	.alias('e', 'extension')
	.alias('r', 'reporter')
	.alias('p', 'path')
	.default('extension', '.test.js')
	.default('reporter', 'spec')
	.default('path', '.')
	.argv;

var files = [];
argv._.forEach(function (file) {
	var fn = path.join(argv.path, file + argv.extension);
	if (fs.existsSync(fn)) files.push(fn);
});
if (!files.length) {
	argv.reporter = 'dot';
	fs.readdirSync(argv.path)
	.filter(function (a) { return /.test.js$/.test(a); })
	.forEach(function (file) {
		var fn = path.join(argv.path, file);
		files.push(fn);
	});
}

var mocha = new Mocha({
	ui: 'bdd',
	reporter: argv.reporter
});

var reporters = ['list', 'spec', 'dot'], a;
(function () {
	for (var i = 0; i < reporters.length; i++) {
		a = argv[reporters[i]];
		if (!a) continue;
		try {
			mocha.reporter(reporters[i]);
			break;
		} catch (e) { }
	}
})();

files.forEach(function (file) { mocha.addFile(file); });

mocha.run(function (failures) {
	process.on('exit', function () {
		process.exit(failures);
	});
});
