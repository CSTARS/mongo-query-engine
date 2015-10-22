var winston = require('winston');
var winstonStream, logger;

module.exports.init = function(config) {

  // setup logger
  // winston log levels: info, warn, error
  // default is to standard out
  var loggerConfig = {
      timestamp : true,
      maxsize   : (config.logging && config.logging.maxsize) ? config.logging.maxsize : 1048576,
      json      : false
  };

  var httpLoggerConfig = {
      timestamp : false,
      maxsize : (config.logging && config.logging.maxsize) ? config.logging.maxsize : 1048576,
      json    : false
  };
  var logTransport = winston.transports.Console;

  if( config.logging && config.logging.dir ) {
      loggerConfig.filename = config.logging.dir+'/app.log';
      httpLoggerConfig.filename = config.logging.dir+'/http.log';
      logTransport = winston.transports.File;
  }
console.log(loggerConfig);
  logger = new (winston.Logger)({
      transports: [new (logTransport)(loggerConfig)]
  });

  var httpLogger = new (winston.Logger)({
      transports: [new (logTransport)(httpLoggerConfig)]
  });

  winstonStream = {
      write: function(message, encoding){
          httpLogger.info(message.replace(/\n$/,''));
      }
  };

  logger.info('App log setup: '+JSON.stringify(loggerConfig));
  logger.info('HTTP log setup: '+JSON.stringify(httpLoggerConfig));
};

module.exports.getStream = function() {
  return winstonStream;
};

module.exports.getLogger = function() {
  return logger;
};
