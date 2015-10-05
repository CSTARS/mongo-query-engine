/**
 * TODO: logger should be optional, same with compression/body-parser middleware.
 */

var compression = require('compression');
var bodyParser = require('body-parser');
var morgan = require('morgan');

var mqe, logger, config, app, database, collection;
var callback, setup;

module.exports.init = function(s, cb) {
  setup = s;
  callback = cb;

  if( !setup.app ) {
    console.error('MQE middleware not provided: app');
    process.exit();
  }
  if( !setup.express ) {
    console.error('MQE middleware not provided: express');
    process.exit();
  }
  if( !setup.config ) {
    console.error('MQE middleware not provided: config');
    process.exit();
  }

  app = setup.app;
  config = setup.config;

  var mongo = require('./lib/mongo');

  // import logger
  var log = require('./lib/log.js');
  log.init(config);
  logger = log.getLogger();
  logger.info('***Starting the Mongo Query Engine (MQE)***');

  //include auth model
  var auth;
  if( config.auth ) {
      auth = require(config.auth.script);
  }

  app.use(compression());
  app.use(bodyParser.json()); // get information from html forms
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(morgan('combined',{stream: log.getStream()}));

  // setup cors
  require('./lib/cors')(app, config);

  // serve the mqe js
  app.use("/mqe/resources/", setup.express.static(__dirname+"/public"));

  // load config and initialize engine
  if( setup.mongo ) { // we already have a mongo connection
    mongo.setConfig({config: config, logger: logger});
    mongo.initIndexes(setup.mongo, onDbReady);
  } else { // we need to create a mongo connection
    mongo.init({config: config, logger: logger}, onDbReady);
  }
};

function onDbReady(db, collect) {
  database = db;
  collection = collect;

  // setup main /mqe/query and /mqe/get endpoints
  mqe = require('./lib/mqe');
  mqe.init({
    config : config,
    collection: collection,
    app : app,
    logger : logger,
    process : setup.process
  });

  // import search engine optimization module
  var seo = require('./lib/seo.js');
  seo.init({
    collection : collection,
    app : app,
    config: config,
    logger : logger
  });
  app.use(seo.escapedFragments);

  logger.info('***MQE is READY!***');

  if( callback ) callback();
}

module.exports.getSetup = function() {
  return {
    mqe : mqe,
    config : config,
    logger : logger,
    database : database,
    collection : collection
  };
};
