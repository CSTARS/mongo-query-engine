var express = require('express');
var passport = require('passport');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('cookie-session');
var http = require('http');
var morgan = require('morgan');

// get the config file
if( process.argv.length < 3 ) {
    console.log("you must provide the location of your config file");
    process.exit();
}

var config = require(process.argv[2]);
global.appConfig = config;

var mongo = require('./lib/mongo');

global.express = express;
global.app = express();

// import logger
var log = require('./lib/log.js');
var logger = global.logger;
logger.info('***Starting the Mongo Query Engine***');

// handle the error safely
//process.on('uncaughtException', function(err) {
//    logger.error(err);
//});

//include auth model
var auth;
if( config.auth ) {
    auth = require(config.auth.script);
}

// setup passport in case the webserver wants authentication setup
app.use(compression());
app.use(cookieParser()); 
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: config.server.cookieSecret || 'peopleareverywhereyouknow' }));
app.use(morgan('combined',{stream: log.getStream()}));
app.use(passport.initialize());
app.use(passport.session());
    
// setup cors
require('./lib/cors');

// import search engine optimization module
var seo = require('./lib/seo.js');
app.use(seo.escapedFragments);

// set the auth endpoints
if( config.auth ) auth.init(app, passport, config);

// serve the mqe js
app.use("/mqe", express.static(__dirname+"/public"));
    


// load config and initialize engine
try {
    mongo.init(function() {
        global.mqe = require('./lib/mqe');

        bootstrap();
    });
} catch (e) {
    console.log("Error bootstrapping webserver");
    console.error(e);
    process.exit();
}

// set auth endpoints
if( config.auth ) auth.setEndpoints(app, passport, config);

function bootstrap() {
    logger.info('bootstrapping  webserver: '+config.server.script);

    // once the database connection is made, bootstrap the webserver
    var webserver = require(config.server.script);
    webserver.bootstrap();
    
    http.createServer(app).listen(config.server.localport);
    logger.info("MQE is up and running at http://"+config.server.host+":"+config.server.localport);
}

