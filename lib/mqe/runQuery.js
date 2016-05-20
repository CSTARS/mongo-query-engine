var mapReduce = require('./mapReduce');

// performs just a filter query
function runQuery(env, query, callback) {
  logger.info("Running query: "+JSON.stringify(query));

  var response = {
    total   : 0,
    start   : query.start,
    stop     : query.stop,
    items   : [],
    filters : {}
  }

  // run mapreduce for counts
  mapReduce(env, query.filters, function(err, result){
    if( err ) {
      response.error = true;
      response.message = err;
    } else {
      response.filters = result;
    }

    // get total for query
    collection.count(query.filters, function(err, count){
      if( err ) {
        response.error = true;
        response.message = err;
      } else {
        response.total = count;
      }

      // actually run mongo query
      run(env, query, function(err, items){
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

// find a sorted range of responsed without returned the entire dataset
function run(env, query, callback) {
  var logger = env.logger;
  logger.info('Running query: '+JSON.stringify(query));

  var projection = projection || {};
  var config = env.config;

  if( query.projection ) {
    for( var key in query.projection ) {
        // you can't turn blacklist items on
        if( projection[key] === 0 ) {
            continue;
        }
        projection[key] = query.projection;
    }
  }
  
  if( config.isMapReduce ) {
      for( var key in projection ) {
          projection[`value.${key}`] = projection[key];
          delete projection[key];
      }
  }

  // if we are setting a text sort, this needs to be included
  var sort = getSortObject(config, query.filters);

  // query all items, but only return the sort field
  var cur = collection.find(options, filters);

  if( sort ) cur.sort(sort);

  cur
    .skip(query.start)
    .limit(query.stop-query.start)
    .toArray(function(err, items) {
      if( err ) {
        logger.error(err);
        return callback(err);
      }

      callback(null, items);
    });
}

function getSortObject(config, filter) {
  var sort = {};
  var hasSort = false;

  if( config.db.sortBy ) {
    hasSort = true;
    
    if( config.db.sortOrder == "textScore" ) {
        filter.mongoTextScore = { $meta: "textScore" }
        sort.mongoTextScore = { $meta: "textScore" };
    } else if( config.db.sortOrder == "desc" ) {
        sort[config.db.sortBy] = -1;
    } else if ( config.db.sortBy ) {
        sort[config.db.sortBy] = 1;
    }
  }
  
  logger.info('sorting items by: '+(hasSort ? JSON.stringify(sort) : ' mongo default sort'));

  if( hasSort ) return sort;
  return null;
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
      if( key === '_id' ) continue;
      flattened[key] = item.value[key];
    }
    items[i] = flattened;
  }
}