module.exports = function(env) {
  
  if( !env.app ) {
    console.error('MQE not provided: express app');
    return;
  }
  if( !env.config ) {
    console.error('MQE not provided: config');
    return;
  }
  if( !env.express ) {
    console.error('MQE not provided: express');
    return;
  }
  
  if( !env.logger ) {
    initLogger(env);
  }
  
  env.collection = env.db.collection(env.config.collection);
  
  // ensure indexes
  require('./lib/mongo')(env);
  
  // serve sitemap and robots.txt

  // serve the mqe js
  env.app.use('/mqe/resources/', env.express.static(`${__dirname}/public`));
  
  logger.info('***MQE is READY!***');
}


function initLogger(env) {
  var log = require('./lib/log.js');
  log.init(config);
  logger = log.getLogger();
  logger.info('***Starting the Mongo Query Engine (MQE)***');
  
  morgan = require('morgan');
  env.app.use(morgan('combined',{stream: log.getStream()}));
}
