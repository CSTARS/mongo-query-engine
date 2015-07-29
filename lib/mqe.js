/**
 * The Mongo Query Engine (MQE)
 */
var mapReduce = require('./mapReduce');
var ObjectId = require('mongodb').ObjectID;

var config, logger, collection, app;

var LIMIT = 1000;
var MAX_FILTER_COUNT = 15000;

// application and process queries before they are executed
var processQuery = null;

var regexMatch = /^\/.*\/$/;

module.exports.init = function(setup) {
  config = setup.config;
  logger = setup.logger;
  collection = setup.collection;
  app = setup.app;

  mapReduce.init(setup);

  // get the results of a query
  app.get('/mqe/query', handleQuery);
  app.get('/mqe/get', handleGet);

  // allow for custom endpoint;
  if( config.rest ) {
    if( config.rest.get ) {
      app.get(config.rest.get, handleGet);
    }
    if( config.rest.query ) {
      app.get(config.rest.query, handleQuery);
    }
  }
};

function handleQuery(req, res) {
  logger.info('/query request recieved');

  getResults(req, function(err, results){
      if( err ) return res.send(err);
      res.send(results);

      logger.info('/query response sent');
  });
}

function handleGet(req, res) {
  logger.info('/get request recieved');

  getItem(req, function(err, result){
      if( err ) return res.send(err);
      res.send(result);

      logger.info('/get response sent');
  });
}


// just return the total number of results for a query
module.exports.filterCountsQuery = function(query, callback) {
  if( !collection ) {
    logger.error('no database connection for mqe.getResults()');
    callback({message:"no database connection"});
  }

  var options = getOptionsFromQuery(query);
  collection.count(options, callback);
};

function getResults(req, callback) {
  if( !collection ) {
    logger.error('no database connection for mqe.getResults()');
    callback({message:"no database connection"});
  }

  filterQuery(queryParser(req), callback);
}
module.exports.getResults = getResults;

function getItem(req, callback) {
  if( !collection ) {
    logger.error('no database connection for mqe.getItem()');
    return callback({error: true, message:"no database connection"});
  }

  // take the first query parameter and retrieve and item by the id;
  var options = {};
  if( config.rest.getParamParser ) {
    options = config.rest.getParamParser(req.query);
  } else {
    for( var key in req.query ) {
      // mapreduce keys are probably strings
      // TODO: should have an option flag to set the id as BSON or whatever
      if( key == "_id" && !config.db.isMapReduce ) options._id = ObjectId(req.query._id);
      else options[key] = req.query[key];
      break;
    }
  }

  var filters = {};
  if( config.db.blacklist ) {
    for( var i = 0; i < config.db.blacklist.length; i++ ) {
      filters[(config.db.isMapReduce ? 'value.' : '') + config.db.blacklist[i]] = 0;
    }
  }

  logger.info('Querying main collection: '+JSON.stringify(options));
  collection.find(options, filters).toArray(function(err, result){
    if( err ) {
      logger.error(err);
      return callback(err);
    }
    if( result.length == 0 ) {
      return callback(null, {error:true, message:'Failed to find: '+JSON.stringify(options)});
    }

    var item = result[0];
    if( config.db.isMapReduce ) {
      item = { _id : result[0]._id };
      for( var key in result[0].value ) {
        item[key] = result[0].value[key];
      }
    }

    logger.info('Main collection query success');
    callback(null, cleanRecord(item));
  });
}
module.exports.getItem = getItem;

// texts in the express request object, parses out request
// sets defaults and sanity checks
function queryParser(req) {
  logger.info('starting query parser');

  // set default parameters
  var query = {
    text           : "",
    filters        : [],
    start          : 0,
    end          : 10,
    includeFilters : false
  };

  for( var i in query ) {
    if( req.query[i] ) query[i] = req.query[i];
  }

  try {
    if( typeof query.start == 'string' ) {
      query.start = parseInt(query.start);
    }
    if( typeof query.end == 'string' ) {
      query.end = parseInt(query.end);
    }
  } catch(e) {}


  if( query.start < 0 ) query.start = 0;
  if( query.end < query.start ) query.end = query.start;

  // parse out json from filter
  try {
    query.filters = JSON.parse(query.filters);
  } catch (e) {
    // TODO: how do we want to handle this
    query.filters = [];
  }

  if( !(query.filters instanceof Array) ) {
    query.filters = [ query.filters ];
  }

  if( processQuery ) processQuery(query, req);

  logger.info('Query parsed: '+JSON.stringify(query));
  return query;
}
module.exports.queryParser = queryParser;

module.exports.setAppQueryParser = function(fn) {
  processQuery = fn;
}

function getOptionsFromQuery(query) {
  if( config.db.isMapReduce ) {
    var obj, i;
    for( i = 0; i < query.filters.length; i++ ) {
      obj = {};
      for( var key in query.filters[i] ) {

        // check for regex
        var value = query.filters[i][key];
        if( typeof value === 'string' && value.match(regexMatch) ) {
          try {
            value = new RegExp(value.replace(/\//g, ''), 'i');
          } catch(e) {}
        }

        if( key[0] == '$' ) {
           obj[key] = value;
         } else {
           obj['value.'+key] = value;
         }
      }
      query.filters[i] = obj;
    }
  }

  var options = {}

  // set geo filter if it exits
  // if so, remove from $and array and set as top level filter option
  if( config.db.geoFilter ) {
    for( var i = 0; i < query.filters.length; i++ ) {
      if( query.filters[i][config.db.geoFilter] ) {
        options[(config.db.isMapReduce ? 'value.' : '') + config.db.geoFilter] = query.filters[i][config.db.geoFilter];
        query.filters.splice(i, 1);
        break;
      }
    }
  }

  for( var i = 0; i < query.filters.length; i++ ) {
    findDates(query.filters[i]);
  }

  if( query.filters.length > 0 ) {
    options["$and"] = query.filters;
  }

  if( query.text && query.text.length > 0 ) {
    options['$text'] = {'$search': query.text.toLowerCase()};
  }

  return options;
}
module.exports.getOptionsFromQuery = getOptionsFromQuery;

// performs just a filter query
function filterQuery(query, callback) {
  logger.info("Running filters only query: "+JSON.stringify(query));

  var options = getOptionsFromQuery(query);

  var response = {
    total   : 0,
    start   : query.start,
    end     : query.end,
    items   : [],
    filters : {}
  }

  // run mapreduce for counts
  filterCounts(options, function(err, result){
    if( err ) {
      response.error = true;
      response.message = err;
    } else {
      response.filters = result;
    }

    // get total for query
    collection.count(options, function(err, count){
      if( err ) {
        response.error = true;
        response.message = err;
      } else {
        response.total = count;
      }

      // actually run mongo query
      rangedQuery(options, query, function(err, items){
        if( err ) {
          logger.error(err);
          return callback(err);
        }

        if( config.db.isMapReduce ) {
          flattenMapreduce(items);
        }

        response.items = items;

        callback(null, response);
      });
    });
  });
}

// currently a mapreduce is in the value namespace,
// remove this and set all attributes of value to first class
function flattenMapreduce(items) {
  var i, key, item, flattened;
  if( !items ) return;

  for( i = 0; i < items.length; i++ ) {
    item = items[i];
    flattened = {
      '_id' : item._id
    };

    for( key in item.value ) {
      flattened[key] = item.value[key];
    }
    items[i] = flattened;
  }
}


module.exports.requestToQuery = function(req) {
  var query = queryParser(req);

  var options = {}

  // set geo filter if it exits
  // if so, remove from $and array and set as top level filter option
  if( config.db.geoFilter ) {
    for( var i = 0; i < query.filters.length; i++ ) {
      if( query.filters[i][config.db.geoFilter] ) {
        options[(config.db.isMapReduce ? 'value.' : '')+config.db.geoFilter] = query.filters[i][config.db.geoFilter];
        query.filters.splice(i, 1);
        break;
      }
    }
  }

  for( var i = 0; i < query.filters.length; i++ ) {
    findDates(query.filters[i]);
  }

  if( config.db.isMapReduce ) {
    for( var i = 0; i < query.filters.length; i++ ) {
      for( var key in query.filters[i] ) {

        var value = query.filters[i][key];
        if( typeof value === 'string' && value.match(regexMatch) ) {
          try {
            value = new RegExp(value, 'i').replace(/\//g, '');
          } catch(e) {}
        }

        if( key[0] == '$' ) {
          query.filters[i][key] = value;
        } else {
          query.filters[i]['value.'+key] = query.filters[i][key];
          delete query.filters[i][key];
        }

      }
    }
  }

  if( query.filters.length > 0 ) options["$and"] = query.filters;

  if( query.text && query.text.length > 0 ) {
    options['$text'] = {'$search': query.text.toLowerCase()};
  }

  var filters = {};
  if( config.db.sortBy ) filters[config.db.sortBy] = 1;

  return {
    options : options,
    filters : filters
  }
}

// replace ISO dates strings with date objects
var dateRegex = /\d\d\d\d-\d\d-\d\dT\d\d:\d\d:.*Z/;
function findDates(obj) {
  for( var key in obj ) {
    if( typeof obj[key] == 'object' ) {
      findDates(obj[key]);
    } else if ( typeof obj[key] == 'string' && obj[key].match(dateRegex) ) {
      obj[key] = new Date(obj[key]);
    }
  }
}


// find a sorted range of responsed without returned the entire dataset
function rangedQuery(options, query, callback) {
  logger.info('Running query: '+JSON.stringify(options)+' '+JSON.stringify(query));

  var filters = {};

  if( config.db.searchWhitelist ) {
    filters._id = 1;
    for( var i = 0; i < config.db.searchWhitelist.length; i++ ) {
      filters[(config.db.isMapReduce ? 'value.' : '') + config.db.searchWhitelist[i]] = 1;
    }
  }

  // if we are setting a text sort, this needs to be included
  var sort = getSortObject(filters);

  // query all items, but only return the sort field
  var cur = collection.find(options, filters);

  if( sort ) cur.sort(sort);

  cur
    .skip(query.start)
    .limit(query.end-query.start)
    .toArray(function(err, items) {
      if( err ) {
        logger.error(err);
        return callback(err);
      }

      // clean out blacklist arrs
      for( var i = 0; i < items.length; i++ ) {
        items[i] = cleanRecord(items[i]);
      }

      callback(null, items);
    });
}

function getSortObject(filter) {
  var sort = {};
  var hasSort = false;

  if( config.db.useMongoTextScore ) {
    filter.mongoTextScore = { $meta: "textScore" }
    sort.mongoTextScore = { $meta: "textScore" };
    hasSort = true;
  }

  if( config.db.sortBy && config.db.sortOrder == "desc" ) {
    sort[config.db.sortBy] = -1;
    hasSort = true;
  } else if ( config.db.sortBy ) {
    sort[config.db.sortBy] = 1;
    hasSort = true;
  }

  logger.info('sorting items by: '+(hasSort ? JSON.stringify(sort) : ' mongo default sort'));

  if( hasSort ) return sort;
  return null;
}

function filterCounts(query, callback) {
  mapReduce.run(query, callback);
  /*mapReduce.run(query, function(err, result){
    if( err ) return callback(err);

    var pathLookup = {};
    for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
      var parts = config.db.indexedFilters[i].split('.');
      parts.pop();
      pathLookup[config.db.indexedFilters[i].replace(/.*\./, '')] = parts.join('');
    }

    for( var key in result ) {
      var path = pathLookup[key];

      if( path.length > 0 )  {
        path += '.';
        result[path+key] = result[key];
        delete result[key];
      }
    }

    callback(null, result);
  });*/
}
module.exports.filterCounts = filterCounts;

// clear the record of any blacklisted attributes
// parse any stringified attributes
function cleanRecord(item) {
  if( !item ) return {};

  if( config.db.blobs ) {
    for( var i = 0; i < config.db.blobs.length; i++ ) {
      var attr = config.db.blobs[i];
      if( item[attr] && typeof item[attr] == 'string' ) {
        try {
          item[attr] = JSON.parse(item[attr]);
        } catch(e) {
          logger.error('Error parsing blob attribute: '+attr);
          logger.error(e);
        }
      }
    }
  }

  return item;
}

// send back and empty result set
function sendEmptyResultSet(query, callback) {
  logger.info("Sending default empty result set");
  callback(
    null,
    {
      total   : 0,
      start   : query.start,
      end     : query.end,
      items   : [],
      filters : {}
    }
  );
}
