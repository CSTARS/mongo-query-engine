var winston = require('winston');
var config = global.appConfig;

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

global.logger = new (winston.Logger)({
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

exports.getStream = function() {
    return winstonStream;
}
