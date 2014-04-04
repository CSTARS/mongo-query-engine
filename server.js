var express = require('express');
var passport = require('passport');
var Browser = require("zombie");
var app = express();
var queryEngine = require('./mqe');
var cp = require('child_process');
var config;

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

// handle the error safely
process.on('uncaughtException', function(err) {
    console.log(err);
});

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
        console.log('Error w/ escapedFragment request:');
        console.log(e);
    }
    
}

// setup passport in case the webserver wants authentication setup
app.configure(function() {
    app.use(express.compress());
    app.use(express.cookieParser()); 
    app.use(expressIeCors);
    app.use(express.bodyParser());
    app.use(express.session({ secret: 'peopleareverywhereyouknow' }));
    app.use(express.logger());
    if( allowCrossDomain ) app.use(allowCrossDomain);
    
    app.use(passport.initialize());
    app.use(passport.session());
    
    app.use(escapedFragments);

    // set the auth endpoints
    if( config.auth ) auth.init(app, passport, config);
    
    app.use(app.router);
});


// load config and initialize engine
try {
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

// set auth endpoints
if( config.auth ) auth.setEndpoints(app, passport, config);


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

// return xml sitemap for all urls
app.get('/rest/sitemap', function(req, res){
    queryEngine.getSitemap(req, function(result){
        if( result.error ) return res.send(result);
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(result.xml);
    });
});


// creates a bot readable snapshot of the landing page
function generateStaticSnapshot(req, res) {

    var url = "http://localhost"+(config.server.localport ? ":"+config.server.localport : "");
    if( !url.match(/\/?/) ) url += "/";
    url = url+"/#"+req.query._escaped_fragment_;
    console.log("STATIC REQUEST: "+ url);


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
                return res.send({error: true, message: 'error generating snapshot'});
            } else if ( stderr.length > 0 ) {
                return res.send({error: true, message: 'error generating snapshot'});
            }

            res.send(stdout);
        }
    );

    /* old fork code */
    /*var zombie = cp.fork(__dirname+'/snapshot.js', [url], {silent:true});
    zombie.stdout.on('data', function (data) {
      html += data;
    });
    zombie.stderr.on('data', function (data) {
      err += data;
    });
    zombie.on('close', function (code) {
        if( err.length > 0 ) return res.send(err);
        res.send(html);
    });*/
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
        }, 5000);
    }

    //run once on start
    setTimeout(function(){
        runImport();
    },5000);
}

function runImport() {
    console.log("Running import module");
    lastImport = new Date().getTime();
    cp.fork(config.import.module, [process.argv[2]]);
}



app.listen(config.server.localport);
console.log("MQE is up and running at http://"+config.server.host+":"+config.server.localport);