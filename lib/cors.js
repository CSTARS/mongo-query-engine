var app = global.app;
var config = global.appConfig;

// crappy IE hacks have made it to the server!!!! 
// man ie is horrible.  Ok, here is the issue: https://github.com/senchalabs/connect/issues/355
// here is the fix: https://github.com/advanced/express-ie-cors, patch below
var expressIeCors = require('express-ie-cors')({contentType: "application/x-www-form-urlencoded;charset=utf-8"});

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

if( allowCrossDomain ) {
    app.use(allowCrossDomain);
    app.use(expressIeCors);
}