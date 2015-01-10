/**
 * The Mongo Query Engine (MQE)
 */
var MongoClient = require('mongodb').MongoClient, db, collection, config;
var ObjectId = require('mongodb').ObjectID;
var cache = require('./cache');

var LIMIT = 100000;
var MAX_FILTER_COUNT = 15000;
var logger;


exports.init = function(conf, log, callback) {
	config = conf;
	logger = log;
	

	connect(function(success){
		if( !success && config.db.initd ) {
			startMongo(function(){
				connect(function(success){
					if( success ) {
						callback();
					} else {
						logger.error("Failed to connect to mongo, attempted mongod startup and still no love.");
						process.exit(-1);
					}
				});
			});
		} else if ( !success ) {
			logger.info("Failed to connect to mongo, no startup script provided (config.db.initd).");
			process.exit(-1);
		} else {
			callback();
		}
	});
}

function connect(callback, quitOnFailure) {
	logger.info('connecting to mongo: '+config.db.url);

	MongoClient.connect(config.db.url, function(err, database) {
		if( err ) {
			logger.error(err);
			return callback(false);
		}

		db = database;
		logger.info("Connected to db: "+config.db.url);
		  
        db.on('close', function(){
        	logger.warn('database fired close event');
        	restartMongo();
        });

		db.collection(config.db.mainCollection, function(err, coll) { 
			if( err ) return logger.error(err);
			logger.info("Connected to collection: "+config.db.mainCollection);
			collection = coll;
			
			// make sure all working indexes are set
			ensureIndexes(function(){
				callback(true);
			});
		});
	});
}


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

exports.getDatabase = function() {
	return db;
}


// just return the total number of results for a query
exports.filterCountsQuery = function(query, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getResults()');
		callback({message:"no database connection"});
	}

	var options = getOptionsFromQuery(query);
	collection.count(options, callback);
}

exports.getResults = function(req, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getResults()');
		callback({message:"no database connection"});
	}
	
	var query = queryParser(req);

	filterQuery(query, callback);
}

exports.getItem = function(req, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getItem()');
		return callback({error: true, message:"no database connection"});
	}

	// take the first query parameter and retrieve and item by the id;
	var options = {};
	for( var key in req.query ) {
		// mapreduce keys are probably strings
		// TODO: should have an option flag to set the id as BSON or whatever
		if( key == "_id" && !config.db.isMapReduce ) options._id = ObjectId(req.query._id);
		else options[key] = req.query[key];
		break;
	}
	
	logger.info('Querying main collection: '+JSON.stringify(options));
	collection.find(options).toArray(function(err, result){
		if( err ) {
			logger.error(err);
			return callback(err);
		}
		if( result.length == 0 ) {
			return callback(null, {error:true, message:'Invalid Id: '+req.query[key]});
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

exports.getSitemap = function(req, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getSitemap()');
		return callback({error:true, message:"no database connection"});
	}

	var host = req.query.host;
	var id = req.query.id;
	if( !host ) {
		logger.error('no host provided');
		return callback({error:true, message:"no host provided"});
	}
	if( !id ) id = "_id";

	options = {title:1};
	options[id] = 1;

	collection.find({},options).toArray(function(err, items){
		if( err ) {
			logger.error(err);
			return callback(err);
		}

		if( !items ) {
			logger.error('Bad response from query: '+JSON.stringify(options));
			return callback({error:true,message:"Bad response from query"});
		}

		if( !host.match(/\/$/) ) host = host + "/";

		var xml = '<?xml version="1.0" encoding="UTF-8"?>'+
				  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
					'<url>'+
    					'<loc>'+host+'</loc>'+
    					'<changefreq>weekly</changefreq>'+
    					'<priority>1</priority>'+
					'</url>';

		for( var i = 0; i < items.length; i++ ) {
			xml += '<url>'+
						'<loc>'+host+'#!lp/'+items[i][id]+'</loc>'+
    					'<changefreq>weekly</changefreq>'+
    					'<priority>.5</priority>'+
    				'</url>';
		}
		xml += '</urlset>';

		callback({xml:xml});
	});
}

function ensureIndexes(callback) {
	logger.info('ensuring indexes');

	var options1 = {};
	
	// create geo index
	if( config.db.geoFilter ) {
		options1[(config.db.isMapReduce ? 'value.' : '')+config.db.geoFilter] = "2dsphere";
		
		logger.info('rebuilding geo index: '+JSON.stringify(options1));

		// drop index
		// TODO: there should be a force option for this
		collection.dropIndex(options1, function(err, result){
			if( err ) logger.error(err);
			logger.info('geo index dropped');

			// rebuild index
			collection.ensureIndex( options1, { w: 1}, function(err) {
				if( err ) {
					logger.error("Error ensuring geo index: ");
					logger.error(err);
				} else {
					logger.info('geo successfully rebuilt');
				}
			});
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
	
	logger.info('rebuilding text index: '+JSON.stringify(options2)+' '+JSON.stringify(options3));

	collection.dropIndex("MqeTextIndex", function(err, result){
		if( err ) logger.error(err);
		logger.info('text index dropped');

		collection.ensureIndex( options2, options3, function(err, result) {
			if( err ) {
				logger.error("Error ensuring text index: ");
				logger.error(err);
			} else {
				logger.info('text index rebuilt');
			}
			callback();
		});
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

// texts in the express request object, parses out request
// sets defaults and sanity checks
function queryParser(req) {
	logger.info('starting query parser');

	// set default parameters
	var query = {
		text           : "",
		filters        : [],
		start          : 0,
		end     	   : 10,
		includeFilters : false
	}
	
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

	logger.info('Query parsed: '+JSON.stringify(query));
	return query;
}
exports.queryParser = queryParser;

// check the cached collection for the query, if exsits return
// otherwise send null
function checkCache(query, callback) {
	logger.info('Checking mqe cache: '+(JSON.stringify(query)));

	logger.info('Forcing cache miss, cache is on the copping block');
	callback();
	return;

	var item = cache.check(JSON.stringify(query));

	if( item ) {
		logger.info('cache hit');
		callback(null, item);
	} else {
		logger.info('cache miss');
		callback();
	}
}


function setCache(query, response) {
	logger.info("Setting cache");

	cache.set(JSON.stringify(query), JSON.stringify(response));
	
	logger.info('cache successfully set');
}

exports.clearCache = function() {
	logger.info('manually clearing cache');
	cache.clear();
}


function getOptionsFromQuery(query) {
	if( config.db.isMapReduce ) {
		var obj, i;
		for( i = 0; i < query.filters.length; i++ ) {
			obj = {};
			for( var key in query.filters[i] ) {
				obj['value.'+key] = query.filters[i][key];
			}
			query.filters[i] = obj;
		}
	}


	logger.info("Running filters only query: "+JSON.stringify(query));

	var options = {}
	
	// set geo filter if it exits 
	// if so, remove from $and array and set as top level filter option
	if( config.db.geoFilter ) {
		for( var i = 0; i < query.filters.length; i++ ) {
			if( query.filters[i][config.db.geoFilter] ) {
				options[config.db.geoFilter] = query.filters[i][config.db.geoFilter];
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
exports.getOptionsFromQuery = getOptionsFromQuery;

// performs just a filter query
function filterQuery(query, callback) {	
	logger.info("Running filters only query: "+JSON.stringify(query));

	var options = getOptionsFromQuery(query);
	
	// going from mongo to json is VERY slow.  And when you return everything it's even slower
	// Here is the fix for now.
	//    - call full query only on selected range
	//    - query all items only returning filters and run counts
	//    - respond to client
	var response = {
		total   : 0,
		start   : query.start,
		end     : query.end,
		items   : [],
		filters : {}
	}

	filterCounts(options, function(err, result){
		if( err ) {
			response.error = true;
			response.message = err;
		} else {
			response.filters = result;
		}

		collection.count(options, function(err, count){
			if( err ) {
				response.error = true;
				response.message = err;
			} else {
				response.total = count;
			}

			rangedQuery(options, query, function(err, items){
				if( err ) {
					logger.error(err);
					return callback(err);
				}

				if( config.db.isMapReduce ) {
					flattenMapreduce(items);
				}

				response.items = items;


				setCache(query, response);
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


exports.requestToQuery = function(req) {
	var query = queryParser(req);

	var options = {}
	
	// set geo filter if it exits 
	// if so, remove from $and array and set as top level filter option
	if( config.db.geoFilter ) {
		for( var i = 0; i < query.filters.length; i++ ) {
			if( query.filters[i][config.db.geoFilter] ) {
				options[config.db.geoFilter] = query.filters[i][config.db.geoFilter];
				query.filters.splice(i, 1);
				break;
			}
		}
	}
	
	for( var i = 0; i < query.filters.length; i++ ) {
		findDates(query.filters[i]);
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
	var filters = {};
	if( config.db.sortBy ) filters[config.db.sortBy] = 1;

	logger.info('Running ranged query: '+JSON.stringify(options)+' '+JSON.stringify(filters));
	// query all items, but only return the sort field
	collection.find(options, filters).limit(LIMIT).toArray(function(err, items) {
		if( err ) {
			logger.error(err);
			return callback(err);
		}

		// sort items
		sortItems(items);

		// now get the items we need (all info)
		var ids = [];
		for( var i = query.start; i < query.end; i++ ) {
			if( i >= items.length ) break;
			ids.push(items[i]._id);
		}

		// now grab all the data for just the returned id's
		logger.info('getting ids: '+JSON.stringify(ids));
		collection.find({ _id : { $in : ids }}).limit(LIMIT).toArray(function(err, items) {
			if( err ) {
				logger.error(err);
				return callback(err);
			}

			// double check they are still sorted, this should be quick
			sortItems(items);

			// clean out blacklist arrs
			for( var i = 0; i < items.length; i++ ) {
				items[i] = cleanRecord(items[i]);
			}

			callback(null, items);
		});

	});
}

function filterCounts(query, callback) {

	var filterNames = [];
	var filterParts = [];
	var filters = [];

	// are we checking against a mapreduce collection?
	for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
		filters.push((config.db.isMapReduce ? 'value.' : '')+config.db.indexedFilters[i]);
	}

	for( var i = 0; i < filters.length; i++ ) {
		filterNames.push(filters[i].replace(/.*\./, ''));
		filterParts.push(filters[i].split('.'));
	}

	var cur = collection.mapReduce(
		function() {
			
			function getValues(obj, index, parts) {
				if( index == parts.length-1 ) {
					return obj[parts[index]];
				} else {
					obj = obj[parts[index]];
					index++;
					return getValues(obj, index, parts);
				}
			}

			var i, values, j, item = {};
			for( i = 0; i < filterNames.length; i++ ) {
				values = getValues(this, 0, filterParts[i]);
				item[filterNames[i]] = {};


				if( typeof values == 'string' ) {
					item[filterNames[i]][values] = 1;
				} else if ( Array.isArray(values) ) {
					for( j = 0; j < values.length; j++ ) {
						item[filterNames[i]][values[j]] = 1;
						if( j == MAX_FILTERS ) break;
					}
				}
			}

			emit(null, item);
		},
		function(id, items) {
			var result = {}, item, i, j, filter, key;

			if( items.length == 0 ) {
				for( i = 0; i < filterNames.length; i++ ) {
					result[filterNames[i]] = {};
				}
				return result;
			} else {
				result = items[0];
			}

			for( i = 1; i < items.length; i++ ) {
				item = items[i];
				for( j = 0; j < filterNames.length; j++ ) {
					filter = item[filterNames[j]];

					for( key in filter ) {
						if( !result[filterNames[j]][key] ) {
							result[filterNames[j]][key] = filter[key];
						} else {
							result[filterNames[j]][key] += filter[key];
						}
					}
				}
			}

			return result;
		},
		{
			out : {
				inline: 1
			},
			query : query,
			scope : {
				filterNames : filterNames,
				filterParts : filterParts,
				MAX_FILTERS : 50
			},
			finalize : function(key, result){
				var arr, i;
				for( filter in result ) {
					arr = [];
					for( value in result[filter] ) {
						arr.push({
							filter : value,
							count : result[filter][value]
						})
					}

					arr.sort(function(a, b){
						if( a.count > b.count ) return -1; 
						if( a.count < b.count ) return 1;
						return 0;
					});

					result[filter] = arr;
				}
				return result;
			}
		},
		function(err, result) {
			if( err ) return callback(err);
			else if( result.length == 0 ) callback(null, {});
			else callback(null, result[0].value);
		}
	);
}
exports.filterCounts = filterCounts;


function sortItems(items) {
	logger.info('sorting items by '+((config.db.sortOrder) ? config.db.sortOrder : ' mongo default sort'));

	if( config.db.useMongoTextScore ) {
		
		var factor = config.db.mongoTextScoreFactor;
		if( !factor ) factor = 50;
		
		for( var i = 0; i < items.length; i++ ) {
			if( items[i].mongo_text_score == null ) items[i].mongo_text_score = 0;
			if( items[i][config.db.sortBy] == null ) items[i][config.db.sortBy] = 0;

			items[i]["_original"+config.db.sortBy] = items[i][config.db.sortBy];
			items[i][config.db.sortBy] = items[i][config.db.sortBy] + (items[i].mongo_text_score * factor );
		}
	}

	// sort items
	if( config.db.sortBy && config.db.sortOrder == "desc" ) {
		items.sort(function(a,b) {
			if( a[config.db.sortBy] > b[config.db.sortBy] ) return -1;
			if( a[config.db.sortBy] < b[config.db.sortBy] ) return 1;
			return 0;
		});
	} else if ( config.db.sortBy ) {
		items.sort(function(a,b) {
			if( a[config.db.sortBy] < b[config.db.sortBy] ) return -1;
			if( a[config.db.sortBy] > b[config.db.sortBy] ) return 1;
			return 0;
		});
	}
	logger.info('sort complete');
}

// clear the record of any blacklisted attributes
// parse any stringified attributes
function cleanRecord(item) {
	if( !item ) return {};

	// TODO: make this part of the query response
	if( config.db.blacklist ) {
		for( var i = 0; i < config.db.blacklist.length; i++ ) {
			if( item[config.db.blacklist[i]] ) delete item[config.db.blacklist[i]];
		}
	}

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
