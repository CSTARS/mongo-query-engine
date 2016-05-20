var MongoClient = require('mongodb').MongoClient, db, collection;
var ObjectId = require('mongodb').ObjectID;


function ensureIndexes(env) {
    var logger = env.logger;
    var config = env.config;
    
    var prefix = config.isMapReduce ? 'value.' : '';
    var collection = env.db.collection(config.collection);
    
    logger.info('ensuring indexes');

    var options = {};

    // create geo index
    if( config.db.geoFilter ) {
      config.db.geoFilter.forEach((geoFilter) => {
        options[`${prefix}${geoFilter}`] = "2dsphere";

        logger.info('ensuring geo index: '+JSON.stringify(options1));

        // rebuild index
        collection.ensureIndex(options, (err) => {
            if( err ) {
                logger.error("Error ensuring geo index: ");
                logger.error(err);
            } else {
                logger.info('geo index ok');
            }
        });
      });
    }

    // now set the index
    options = {};
    for( var i = 0; i < config.db.textIndexes.length; i++ ) {
        options[`${prefix}${config.db.textIndexes[i]}`] = "text";
    }

    var textOptions = {
            name : "MqeTextIndex"
    };
    if( config.db.textIndexWeights ) {
        textOptions.weights = config.db.textIndexWeights;
    }

    logger.info('ensuring text index: '+JSON.stringify(options2)+' '+JSON.stringify(options3));

    collection.ensureIndex(options, textOptions, (err, result) => {
        if( err ) {
            logger.error("Error ensuring text index: ");
            logger.error(err);
        } else {
            logger.info('text index ok');
        }
    });

    for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
        options = {};
        options[`${prefix}${config.db.indexedFilters[i]}`] = 1;

        logger.info('Ensuring index: '+JSON.stringify(options4));
        collection.ensureIndex(options, (err) => {
            if( err ) {
                logger.error("Error ensuring index: ");
                logger.error(err);
            }
        });
    }
}

module.exports = ensureIndexes;
