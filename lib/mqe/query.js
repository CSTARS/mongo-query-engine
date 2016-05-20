var queryParser = require('./queryParser');
var filterQuery = require('./filterQuery');

module.exports = function(env) {
    var cors = require('../cors')(env.config);
    
    return function(req, res) {
        env.logger.info('/query request recieved');
        cors(res);

        getResults(env, req, function(err, results){
            if( err ) return res.send(err);

            // user can override this
            if( env.process.query ) {
                env.process.query(req.query, results.items, function(items){
                    results.items = items;
                    res.send(results);
                    env.logger.info('/query response sent');
                });
            } else {
                res.send(results);
                env.logger.info('/query response sent');
            }
        });
    }
}

function getResults(env, req, callback) {
  if( !env.collection ) {
    env.logger.error('no database connection for mqe.getResults()');
    return callback({message:"no database connection"});
  }

  var params = queryParser(env, req);
  var query = createQuery(env, params);

  filterQuery(, callback);
}