/**
 * The Mongo Query Engine (MQE)
 */
var get = require('./get');
var query = require('./query');

var LIMIT = 1000;
var MAX_FILTER_COUNT = 15000;

module.exports.init = function(env) {
  setup = s;
  config = setup.config;
  logger = setup.logger;
  collection = setup.collection;
  app = setup.app;

  mapReduce.init(setup);

  if( !setup.process ) {
    setup.process = {};
  }

  // get the results of a query
  app.get('/mqe/query', handleQuery);
  app.get('/mqe/get', handleGet);

  // make sure this is an array
  if( config.db.geoFilter ) {
    if( typeof config.db.geoFilter === 'string' ) {
      config.db.geoFilter = [config.db.geoFilter];
    }
  }

  // allow for custom endpoint;
  if( config.rest ) {
    if( config.rest.get ) {
      app.get(config.rest.get, get);
    }
    if( config.rest.query ) {
      app.get(config.rest.query, query);
    }
  }
};