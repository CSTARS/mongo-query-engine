var express = require('express');
var app = express();
var queryEngine = require('./mqe');
var config;

// get the config file
if( process.argv.length < 3 ) {
	console.log("you must provide the location of your config file");
	process.exit();
}

// load config and initialize engine
try {
	config = require(process.argv[2]);
	queryEngine.init(config);
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

app.use("/", express.static(config.server.webroot));


app.listen(config.server.port);
console.log("MQE is up and running at http://"+config.server.host+":"+config.server.port);