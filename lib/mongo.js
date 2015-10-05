var MongoClient = require('mongodb').MongoClient, db, collection;
var ObjectId = require('mongodb').ObjectID;

var config, logger;

exports.init = function(setup, callback) {
  setConfig(setup);

  connect(function(database, collection){
      if( !database ) {
          logger.info("Failed to connect to mongo, no startup script provided (config.db.initd).");
          process.exit(-1);
      } else {
          callback(database, collection);
      }
  });
};


function connect(callback, quitOnFailure) {
    logger.info('Connecting to MongoDB: '+config.db.url);

    MongoClient.connect(config.db.url, function(err, database) {
        if( err ) {
            logger.error(err);
            return callback(false);
        }

        logger.info("Connected to MongoDB");

        database.on('close', function(){
            logger.warn('database fired close event');
            restartMongo();
        });

        initIndexes(database, callback);
    });
}

function setConfig(setup) {
  config = setup.config;
  logger = setup.logger;
}
module.exports.setConfig = setConfig;

function initIndexes(database, callback) {
  database.collection(config.db.mainCollection, function(err, coll) {
      if( err ) return logger.error(err);
      logger.info("Connected to collection: "+config.db.mainCollection);

      collection = coll;



      // make sure all working indexes are set
      ensureIndexes(function(){
          callback(database, collection);
      });
  });
}
module.exports.initIndexes = initIndexes;


function startMongo(callback) {
    // fork to mongod process
    var exec = require('child_process').exec;
    function puts(error, stdout, stderr) {
        if( error ) logger.info('MongoDB: '+JSON.stringify(error));
        if( stdout ) logger.info('MongoDB: '+stdout);
        if( stderr ) logger.error('MongoDB: '+stderr);
    }

    // make sure text search is enabled
    var initd = config.db.initd;
    if( !initd.match(/.*textSearchEnabled.*/) ) {
        initd = initd+' --setParameter textSearchEnabled=true';
    }

    logger.info("Starting MongoDB: "+config.db.initd);
    exec(initd, puts);


    // TODO: is there a better way to know when things are running?
    setTimeout(function(){
        if( callback ) callback();
    }, 3000);
}



// if mongo goes down attempt to restart is
var restartCount = 0;
var restartTimer = -1;
function restartMongo() {
    logger.info('Attempting mongo restart, attempt: '+(restartCount+1));

    restartCount++;
    if( restartCount > 3 ) {
        logger.error('Attempted 3 restarts of mongo, all failed.  Quiting out.');
        process.exit(-1);
    }

    startMongo(function(){

        connect(function(success){
            if( success ) {
                logger.info('MongoDB restart success');
            } else {
                setTimeout(function(){
                    restartMongo();
                }, 2000);
            }
        });
    });

    // after an hour assume all is well
    if( restartTimer != -1 ) return;
    restartTimer = setTimeout(function(){
        restartCount = 0;
    }, 1000*60*60);
}

function dropIndexes() {
    logger.info('dropping indexes');

    var options1 = {};

    // create geo index
    if( config.db.geoFilter ) {
        options1[(config.db.isMapReduce ? 'value.' : '') + config.db.geoFilter] = "2dsphere";

        logger.info('dropping geo index: '+JSON.stringify(options1));

        // drop index
        // TODO: there should be a force option for this
        collection.dropIndex(options1, function(err, result){
            if( err ) logger.error(err);
            logger.info('geo index dropped');
        });
    }


    // now set the index
    var options2 = {};
    for( var i = 0; i < config.db.textIndexes.length; i++ ) {
        options2[(config.db.isMapReduce ? 'value.' : '')+config.db.textIndexes[i]] = "text";
    }

    var options3 = {
            name : "MqeTextIndex"
    };
    if( config.db.textIndexWeights ) {
        options3.weights = config.db.textIndexWeights;
    }

    logger.info('dropping text index: '+JSON.stringify(options2)+' '+JSON.stringify(options3));
    collection.dropIndex("MqeTextIndex", function(err, result){
        if( err ) logger.error(err);
        logger.info('text index dropped');
    });


    for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
        var options4 = {};
        options4[(config.db.isMapReduce ? 'value.' : '')+config.db.indexedFilters[i]] = 1;

        logger.info('Ensuring index: '+JSON.stringify(options4));
        collection.ensureIndex( options4, function(err) {
            if( err ) {
                logger.error("Error ensuring index: ");
                logger.error(err);
            }
        });
    }
}

function ensureIndexes(callback) {
    logger.info('ensuring indexes');

    var options1 = {};

    // create geo index
    if( config.db.geoFilter ) {
        options1[(config.db.isMapReduce ? 'value.' : '')+config.db.geoFilter] = "2dsphere";

        logger.info('ensuring geo index: '+JSON.stringify(options1));

        // rebuild index
        collection.ensureIndex( options1, function(err) {
            if( err ) {
                logger.error("Error ensuring geo index: ");
                logger.error(err);
            } else {
                logger.info('geo index ok');
            }
        });
    }

    // now set the index
    var options2 = {};
    for( var i = 0; i < config.db.textIndexes.length; i++ ) {
        options2[(config.db.isMapReduce ? 'value.' : '')+config.db.textIndexes[i]] = "text";
    }

    var options3 = {
            name : "MqeTextIndex"
    };
    if( config.db.textIndexWeights ) {
        options3.weights = config.db.textIndexWeights;
    }

    logger.info('ensuring text index: '+JSON.stringify(options2)+' '+JSON.stringify(options3));

    collection.ensureIndex( options2, options3, function(err, result) {
        if( err ) {
            logger.error("Error ensuring text index: ");
            logger.error(err);
        } else {
            logger.info('text index ok');
        }
        callback();
    });

    for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
        var options4 = {};
        options4[(config.db.isMapReduce ? 'value.' : '')+config.db.indexedFilters[i]] = 1;

        logger.info('Ensuring index: '+JSON.stringify(options4));
        collection.ensureIndex( options4, function(err) {
            if( err ) {
                logger.error("Error ensuring index: ");
                logger.error(err);
            }
        });
    }
}
