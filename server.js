var express = require('express');
var passport = require('passport');
var app = express();
var queryEngine = require('./mqe');
var config;

// get the config file
if( process.argv.length < 3 ) {
	console.log("you must provide the location of your config file");
	process.exit();
}

// setup passport in case the webserver wants authentication setup
app.configure(function() {
	app.use(express.cookieParser()); 
	app.use(express.bodyParser());
	app.use(express.session({ secret: 'peopleareverywhereyouknow' }));
	app.use(passport.initialize());
	app.use(passport.session());
	app.use(app.router);
});


// load config and initialize engine
try {
	config = require(process.argv[2]);
	queryEngine.init(config, function(){
		// once the database connection is made, bootstrap the webserver
		var webserver = require(config.server.script);
		webserver.bootstrap({
			express: express, 
			passport: passport,
			app: app,
			mqe: queryEngine
		});
	});
} catch (e) {
	console.log("failed to load config file");
	console.log(e);
	process.exit();
}


// get the results of a query
app.get('/rest/query', function(req, res){
	queryEngine.getResults(req, function(err, results){
		if( err ) return res.send(err);
		res.send(results);
	});
});

app.get('/rest/get', function(req, res){
	queryEngine.getItem(req, function(err, result){
		if( err ) return res.send(err);
		res.send(result);
	});
});

//get the results of a query
app.get('/rest/update', function(req, res){
	queryEngine.update(function(err, results){
		if( err ) return res.send(err);
		res.send(results);
	});
});

app.use("/mqe", express.static(__dirname+"/public"));



app.listen(config.server.port);
console.log("MQE is up and running at http://"+config.server.host+":"+config.server.port);