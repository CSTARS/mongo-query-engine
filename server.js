var express = require('express');
var passport = require('passport');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('cookie-session');
var http = require('http');
var morgan = require('morgan');
var Browser = require("zombie");
var app = express();
var queryEngine = require('./mqe');
var cp = require('child_process');
var config;

var winston = require('winston');


// crappy IE hacks have made it to the server!!!! 
// man ie is horrible.  Ok, here is the issue: https://github.com/senchalabs/connect/issues/355
// here is the fix: https://github.com/advanced/express-ie-cors, patch below
var expressIeCors = require('express-ie-cors')({contentType: "application/x-www-form-urlencoded;charset=utf-8"});

// get the config file
if( process.argv.length < 3 ) {
    console.log("you must provide the location of your config file");
    process.exit();
}

config = require(process.argv[2]);

// setup logger
// winston log levels: info, warn, error
// default is to standard out
var loggerConfig = {
    timestamp : true, 
    maxsize   : (config.logging && config.logging.maxsize) ? config.logging.maxsize : 1048576,
    json      : (config.logging && config.logging.json != null) ? config.logging.json : false
}
var httpLoggerConfig = {
    timestamp : false,
    maxsize : (config.logging && config.logging.maxsize) ? config.logging.maxsize : 1048576,
    json    : (config.logging && config.logging.json != null) ? config.logging.json : false
}
var logTransport = winston.transports.Console;

if( config.logging && config.logging.dir ) {
    loggerConfig.filename = config.logging.dir+'/app.log';
    httpLoggerConfig.filename = config.logging.dir+'/http.log';
    logTransport = winston.transports.File;
}


var logger = new (winston.Logger)({
    transports: [new (logTransport)(loggerConfig)]
});
var httpLogger = new (winston.Logger)({
    transports: [new (logTransport)(httpLoggerConfig)]
});

var winstonStream = {
    write: function(message, encoding){
        httpLogger.info(message.replace(/\n$/,''));
    }
};

logger.info('***Starting the Mongo Query Engine***');


// handle the error safely
/*process.on('uncaughtException', function(err) {
    logger.error(err);
});*/


//include auth model

var auth;
if( config.auth ) {
    auth = require(config.auth.script);
}

// setup cors
var allowCrossDomain = null;
if( config.server.allowedDomains ) {
    allowCrossDomain = function(req, res, next) {
        if( config.server.allowedDomains.indexOf(req.host) == -1 
            && config.server.allowedDomains.indexOf('*') == -1 ) return next();
        
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        next();
    }
}

// middleware to handle _escaped_fragment_ requests
// this allows google and (others?) to crawl mqe sites
// https://support.google.com/webmasters/answer/174992?hl=en
var escapedFragments = function(req, res, next) {
    if( !req.query._escaped_fragment_ ) return next();
    try {
        generateStaticSnapshot(req, res);
    } catch(e) {
        res.send({error:true,message:'error generating snapshot'});
        logger.error('Error w/ escapedFragment request:');
        logger.error(e);
    }   
}

function runImport(callback) {
    logger.info("Running import module: "+config.node+' '+config.import.module+' '+process.argv[2]);
    lastImport = new Date().getTime();

    // allow imports to run for up to 1 hour
    cp.exec(config.node+' '+config.import.module+' '+process.argv[2],
        { encoding: 'utf8',
          timeout: 1000*60*60,
          //maxBuffer: 200*1024,
          killSignal: 'SIGKILL'
          //cwd: null,
          //env: null 
        },
        function (error, stdout, stderr) {
            if( error ) logger.error('Importer: '+((typeof error == 'object') ? JSON.stringify(error) : error));
            if( stdout ) logger.info('Importer: '+stdout);
            if( stderr ) logger.error('Importer: '+stderr);

            if( !callback ) return;
            
            callback({
                error : error,
                stdout : stdout,
                stderr : stderr
            });
        }
    );
}

// setup passport in case the webserver wants authentication setup
app.use(compression());
app.use(cookieParser()); 
app.use(expressIeCors);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'peopleareverywhereyouknow' }));
app.use(morgan('combined',{stream:winstonStream}));
if( allowCrossDomain ) app.use(allowCrossDomain);
    
app.use(passport.initialize());
app.use(passport.session());
    
app.use(escapedFragments);

// set the auth endpoints
if( config.auth ) auth.init(app, passport, config);
    

// load config and initialize engine
try {
    queryEngine.init(config, logger, function(){
        logger.info('bootstrapping  webserver: '+config.server.script);

        // once the database connection is made, bootstrap the webserver
        var webserver = require(config.server.script);
        webserver.bootstrap({
            express: express, 
            passport: passport,
            app: app,
            mqe: queryEngine,
            logger: logger,
            runImport : runImport
        });
	
	
	http.createServer(app).listen(config.server.localport);
	logger.info("MQE is up and running at http://"+config.server.host+":"+config.server.localport);

    });
} catch (e) {
    console.log("failed to load config file");
    console.log(e);
    process.exit();
}

// set auth endpoints
if( config.auth ) auth.setEndpoints(app, passport, config);

// get the results of a query
app.get('/rest/query', function(req, res){
    logger.info('/query request recieved');

    queryEngine.getResults(req, function(err, results){
        if( err ) return res.send(err);
        res.send(results);

        logger.info('/query response sent');
    });
});

app.get('/rest/get', function(req, res){
    logger.info('/get request recieved');

    queryEngine.getItem(req, function(err, result){
        if( err ) return res.send(err);
        res.send(result);

        logger.info('/get response sent');
    });
});

// return xml sitemap for all urls
app.get('/rest/sitemap', function(req, res){
    logger.info('/sitemap request recieved');

    queryEngine.getSitemap(req, function(result){
        if( result.error ) return res.send(result);
        res.set('Content-Type', 'text/xml; charset=utf-8');

        res.send(result.xml);
        logger.info('/sitemap response sent');
    });
});

// manually clear the simple memcache
app.get('/rest/clearCache', function(req, res){
    logger.info('/clearCache request recieved');
    queryEngine.clearCache();
    res.send('Success');
});


// creates a bot readable snapshot of the landing page
function generateStaticSnapshot(req, res) {
    logger.info('snapshot request recieved');

    var url = "http://localhost"+(config.server.localport ? ":"+config.server.localport : "");
    if( !url.match(/\/?/) ) url += "/";
    url = url+"/#"+req.query._escaped_fragment_;
    
    logger.info('snapshot url: '+url);

    var err = '';
    var html = '';

    if( !config.node ) {
        return res.send({error: true, message: 'bin/node not set in config'});
    }

    /* exec */
    var t = new Date().getTime();
    cp.exec(config.node+' '+__dirname+'/snapshot.js \''+url+'\'',
        { encoding: 'utf8',
          timeout: 1000*60,
          //maxBuffer: 200*1024,
          killSignal: 'SIGKILL'
          //cwd: null,
          //env: null 
        },
        function (error, stdout, stderr) {
            if( error != null ) {
                logger.error('error generating snapshot');
                return res.send({error: true, message: 'error generating snapshot'});
            } else if ( stderr.length > 0 ) {
                logger.error('error generating snapshot');
                return res.send({error: true, message: 'error generating snapshot'});
            }

            logger.error('snapshot generation complete: '+url);
            res.send(stdout);
        }
    );

}


// serve the mqe js
var lastImport = 0;
app.use("/mqe", express.static(__dirname+"/public"));

// if the server has an import module, schedule it,
if( config.import && config.import.module ) {
    

    if( config.import.interval ) { // run importer on a certain interval
        setInterval(function(){
            runImport();
        }, config.import.interval);

        // run importer at certain times... can use wildcard "*" from hour
    } else if ( config.import.hour && config.import.minute ) {

        setInterval(function(){
            var t = new Date();

            if( (t.getHours() == config.import.hour || config.import.hour == "*" ) 
                && config.import.minute == t.getMinutes() && (t.getTime() - lastImport) > 60000 ){
                // fork a child process for the importer
                runImport();
            }
        }, 60000);
    }

    //run once on start
    setTimeout(function(){
        runImport();
    },5000);
}

