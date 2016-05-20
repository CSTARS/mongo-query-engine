var ObjectId = require('mongodb').ObjectID;


module.exports = function(env) {
    var logger = env.logger;
    var cors = require('../cors')(env.config);
    
    return function(req, res) {
        logger.info('/get request recieved');
        cors(res);

        getItem(env, req, function(err, result){
            if( err ) return res.send(err);

            // user can override this
            if( env.process.get ) {
                env.process.get(req.query, result, function(result){
                    res.send(result);
                    logger.info('/get response sent');
                });
            } else {
                res.send(result);
                logger.info('/get response sent');
            }
        });
    }

}

function getItem(env, req, callback) {
    var collection = env.collection;
    var config = env.config;
    var logger = env.logger;
    
    if( !collection ) {
        logger.error('no database connection for mqe.getItem()');
        return callback({error: true, message:"no database connection"});
    }

    // take the first query parameter and retrieve and item by the id;
    var query = {};
    if( config.rest.getParamParser ) {
        query = config.rest.getParamParser(req.query);
    } else {
        for( var key in req.query ) {
            // mapreduce keys are probably strings
            // TODO: should have an option flag to set the id as BSON or whatever
            if( key == "_id" && !config.db.isMapReduce ) query._id = ObjectId(req.query._id);
            else query[key] = req.query[key];
            break;
        }
    }

    var projection = config.projection || {};
    if( config.isMapReduce ) {
        for( var key in projection ) {
            filters[`value.${key}`] = projection[key];
            delete filters[key];
        }
    }

    logger.info('Querying main collection: '+JSON.stringify(options));
    collection.findOne(query, projection, function(err, item){
        if( err ) {
            logger.error(err);
            return callback(err);
        }
        
        if( !item ) {
            return callback(null, {error:true, message:'Failed to find: '+JSON.stringify(query)});
        }

        if( config.db.isMapReduce ) {
            var tmp = { _id : item._id };
            for( var key in item.value ) {
                tmp[key] = item.value[key];
            }
            item = tmp;
        }

        logger.info('Main collection query success');
        callback(null, item);
    });
}