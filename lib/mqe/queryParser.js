// takes in the express request object, parses out request
// sets defaults and sanity checks
function queryParser(env, req) {
  logger.info('starting query parser');

  // set default parameters
  var query = {
    text           : "",
    filters        : [],
    start          : 0,
    stop          : 10,
    includeFilters : false,
    projection : {},
  };

  // copy in provided parameter
  for( var i in query ) {
    if( req.query[i] ) {
        query[i] = req.query[i];
    }
  }

  // TODO: remove this one day...
  if( query.end !== undefined && query.stop === undefined ) {
    query.stop = query.end;
    delete query.end;
  }

  query.start = parseInt(query.start);
  query.stop = parseInt(query.stop);

  // validate parameters
  if( query.start < 0 ) {
      query.start = 0;
  }
  if( query.stop < query.start ) {
      query.stop = query.start;
  }

  // parse out json from filter
  try {
    query.filters = JSON.parse(query.filters);
  } catch (e) {
    query.filters = {};
  }

  // parse out json from projection
  try {
    query.projection = JSON.parse(query.projection);
  } catch (e) {
    // TODO: how do we want to handle this
    delete query.projection;
  }

  if( env.process && env.proces.prequery ) {
      env.proces.prequery(query, req);
  }

  env.logger.info('Query parsed: '+JSON.stringify(query));
  return query;
}

module.exports = queryParser;