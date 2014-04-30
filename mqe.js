/**
 * The Mongo Query Engine (MQE)
 */
var MongoClient = require('mongodb').MongoClient, db, collection, cache, config;
var ObjectId = require('mongodb').ObjectID;
var extend = require('extend');

var LIMIT = 100000;
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
		db.collection(config.db.cacheCollection, function(err, cash) { 
			if( err ) return logger.error(err);
			logger.info("Connected to cache collection: "+config.db.cacheCollection);
			cache = cash;
		});
	});
}

function startMongo(callback) {

	// fork to mongod process
	var exec = require('child_process').exec;
	function puts(error, stdout, stderr) { 
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

exports.getResults = function(req, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getResults()');
		callback({message:"no database connection"});
	}
	
	var query = queryParser(req);

	checkCache(query, function(err, result) {
		// if cache err, let console know, but continue on
		if( err ) logger.error(err);
		
		// if cache hit, return
		if( result ) {
			callback(null, result);
			return;
		}
		
		if( query.text.length > 0 ) {
			textQuery(query, callback);
		} else {
			filterQuery(query, callback);
		}
	});
}

exports.getItem = function(req, callback) {
	if( !db || !collection ) {
		logger.error('no database connection for mqe.getItem()');
		return callback({error: true, message:"no database connection"});
	}

	// take the first query parameter and retrieve and item by the id;
	var options = {};
	for( var key in req.query ) {
		if( key == "_id" ) options._id = ObjectId(req.query._id);
		else options[key] = req.query[key];
	}
	
	logger.info('Querying main collection: '+JSON.stringify(options));
	collection.find(options).toArray(function(err, result){
		if( err ) {
			logger.error(err);
			return callback(err);
		}

		logger.info('Main collection query success');
		callback(null, cleanRecord(result[0]));
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
		options1[config.db.geoFilter] = "2dsphere";
		
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
		options2[config.db.textIndexes[i]] = "text";
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
		options4[config.db.indexedFilters[i]] = 1;

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

// check the cached collection for the query, if exsits return
// otherwise send null
function checkCache(query, callback) {
	logger.info('Checking mqe cache: '+(JSON.stringify(query)));

	cache.find({ 'query.text': query.text, 'query.filters': JSON.stringify(query.filters) }).toArray(function(err, items) {
		if( err ) {
			logger.error(err);
			return callback(err);
		}
		
		// get cached items
		if( items.length > 0 ) {
			logger.info("Cache Hit");
			var cacheResult = items[0];
			
			cacheResult.query.filters = JSON.parse(cacheResult.query.filters);

			// unescape any foo.bar filter, can't have '.' in key
			for( var key in cacheResult.filters ) {
				if( key.match(/.*\:\:.*/) ) {
					cacheResult.filters[key.replace(/::/g,'.')] = cacheResult.filters[key];
					delete cacheResult.filters[key];
				}
			}
			
			// get id's for the range we care about
			var cacheItems = setLimits(query, cacheResult.items);
			cacheResult.start = query.start;
			cacheResult.end = query.end;
			
			if( cacheItems.length > 0 ) {
				
				var options = { $or : [] };
				for( var i = 0; i < cacheItems.length; i++ ) {
					options.$or.push({_id: cacheItems[i] });
				}
				
				
				collection.find(options).toArray(function(err, items) {
					if( err ) {
						logger.error(err);
						return callback(err);
					}
					
					// clear blacklist
					for( var i = 0; i < items.length; i++ ) {
						items[i] = cleanRecord(items[i]);
					}
				
					cacheResult.items = items;
					callback(null, cacheResult);
				});
				return;
			}

			logger.warn('sending back empty cache result');
			
			// it's empty ... hummmm
			sendEmptyResultSet(query, callback);
			return;
		}
		logger.info("Cache miss");
		
		// cache miss
		callback(null, null);
	});
}

// performs a text and filter (optional) query
function textQuery(query, callback) {
	logger.info("Running text query: "+JSON.stringify(query));
	
	var command = {
		text: config.db.mainCollection,  
		search : query.text.toLowerCase(),
		limit  : LIMIT
	};
	
	if( query.filters.length > 0 ) {
		command.filter = {};
		
		// set geo filter if it exits 
		// if so, remove from $and array and set as top level filter option
		if( config.db.geoFilter ) {
			for( var i = 0; i < query.filters.length; i++ ) {
				if( query.filters[i][config.db.geoFilter] ) {
					command.filter[config.db.geoFilter] = query.filters[i][config.db.geoFilter];
					query.filters.splice(i, 1);
					break;
				}
			}
		}
		
		if( query.filters.length > 0 )  command.filter["$and"] = query.filters;
	}
	
	logger.info('MongoDB query: '+command);
	db.executeDbCommand(command, function(err, resp) {
		if( err ) {
			logger.error(err);
			return callback(err);
		}
		
		// make sure we got something back from the mongo
		if( resp.documents.length == 0 || !resp.documents[0].results || resp.documents[0].results.length == 0 ) {
			return sendEmptyResultSet(query, callback);
		}
		
		var items = [];
		for( var i = 0; i < resp.documents[0].results.length; i++ ) {
			if( config.db.useMongoTextScore ) {
				resp.documents[0].results[i].obj.mongo_text_score = resp.documents[0].results[i].score; 
			}
			items.push(resp.documents[0].results[i].obj);
		}
		
		handleItemsQuery(query, items, callback);
	});
}

// performs just a filter query
function filterQuery(query, callback) {	
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
	
	if( query.filters.length > 0 ) options["$and"] = query.filters;

	// going from mongo to json is VERY slow.  And when you return everything it's even slower
	// Here is the fix for now.
	//    - call full query only on selected range
	//    - query all items only returning filters and run counts
	//    - respond to client
	//    - now run full query and cache
	var response = {
		total   : 0,
		start   : query.start,
		end     : query.end,
		items   : [],
		filters : {}
	}

	filterCounts(options, query, function(err, total, filters){
		if( err ) {
			logger.error(err);
			return callback(err);
		}

		response.total = total;
		response.filters = filters;

		rangedQuery(options, query, function(err, items){
			if( err ) {
				logger.error(err);
				return callback(err);
			}

			response.items = items;
			callback(null, response);

			// now run entire query so we can cache
			logger.info('Running entire query to set cache');
			collection.find(options).limit(LIMIT).toArray(function(err, items) {
				handleItemsQuery(query, items);
			});
		});
	})

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

// get just the filter counts for a query
function filterCounts(options, query, callback) {
	var filters = {};
	for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
		filters[config.db.indexedFilters[i]] = 1;
	}

	logger.info('Getting filter counts: '+JSON.stringify(options)+' '+JSON.stringify(filters));

	// query and respond only with the count fields
	collection.find(options, filters).limit(LIMIT).toArray(function(err, items) {
		if( err ) return callback(err);
		callback(null, items.length, getFilters(items, query.filters));
	});
}


function handleItemsQuery(query, items, callback) {
	logger.info("Handling response");
	
	var response = {
		total   : 0,
		start   : query.start,
		end     : query.end,
		items   : [],
		filters : {}
	}
	
	// make sure we got something back from the mongo
	if( items.length == 0 ) {
		return sendEmptyResultSet(query, callback);
	}
	
	sortItems(items);
	
	response.total = items.length;

	response.filters = getFilters(items, query.filters);
	response.query = query;
	response.items = items;
	setCache(response);
	
	response.items = setLimits(query, items);
	
	// clean out blacklist attr
	for( var i = 0; i < response.items.length; i++ ) {
		response.items[i] = cleanRecord(response.items[i]);
	}
	
	// I know this seems backwards, but we always want to cache the filters
	// so we run that and then remove if filters were not requested
	if( !query.includeFilters ) {
		delete response.filters;
	}

	logger.info('sending response');
	if( callback ) callback(null, response);
}

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

function setCache(response) {
	logger.info("Setting cache");
	
	var filters = extend(true,{},response.filters);
	
	// escape any foo.bar filter, can't have '.' in key
	for( var key in filters ) {
		if( key.match(/.*\..*/) ) {
			filters[key.replace(/\./,"::")] = filters[key];
			delete filters[key];
		}
	}
	
	var cacheItem = {
		query : {
			filters : JSON.stringify(response.query.filters),
			text    : response.query.text
		},
		items   : [],
		filters : filters,
		total   : response.total
	};
	
	for( var i = 0; i < response.items.length; i++ ) {
		cacheItem.items.push(response.items[i]._id);
	}
	
	cache.insert(cacheItem, {w:1}, function(err, result){
		if( err ) {
			logger.error(err);
		} else {
			logger.info('cache successfully set');
		}
	});
}

// find all filters for query
function getFilters(items, currentFilters) {
	logger.info("Aggergating results for filter counts");

	var filters = {}, item, value;
	
	// get the attributes we care about from the config file
	for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
		filters[config.db.indexedFilters[i]] = {};
	}
	
	// loop over all result items
	for( var i = 0; i < items.length; i++ ) {
		item = items[i];
		
		// for each result item, check for filters we care about
		for( var filter in filters ) {

			// now see if it's a nested filter, only supporting one level
			// and nested 
			if ( filter.match(/.*\..*/) ) {
				var parts = filter.split(".");
				var subFilter = item[parts[0]];
				
				if( subFilter && (subFilter instanceof Array) ) {
					for( var j = 0; j < subFilter.length; j++ ) {
						addFilter(filters, currentFilters, subFilter[j][parts[1]], filter);
					}
				}
				
			} else {
				addFilter(filters, currentFilters, item[filter], filter);
			}
			
		}
		
	}
	
	// now turn into array and sort by count
	var array;
	for( var filter in filters ) {
		array = [];
		
		// create
		for( var key in filters[filter] ) {
			array.push({filter: key, count: filters[filter][key]});
		}
		
		// sort
		array.sort(function(a,b) {
			return b.count - a.count;
		});
		
		filters[filter] = array;
	}
	
	// 	check to see if any array is empty and throw it out
	for( var filter in filters ) {
		if( filters[filter].length == 0 ) delete filters[filter];
	}
	
	logger.info("Aggergation complete");
	return filters;
}


function addFilter(filters, currentFilters, attrValue, filter) {
	
	// does this item have the filter and is it an array
	if( attrValue && (attrValue instanceof Array)  ) {
		
		// loop through the filters array and increment the filters count
		for( var j = 0; j < attrValue.length; j++ ) {
			value = attrValue[j];
			
			// if it's in the current filters, ignore
			if( hasFilter(filter, value, currentFilters) ) continue;
			
			// add to count
			if( filters[filter][value] ) filters[filter][value]++;
			else filters[filter][value] = 1;
		}
		
	} else if( attrValue ) {

		value = attrValue;
		
		// if it's in the current filters, ignore
		if( hasFilter(filter, value, currentFilters) ) return;
		
		// add to count
		if( filters[filter][value] ) filters[filter][value]++;
		else filters[filter][value] = 1;

	}
	
}

// see if the filter/value is in the current list of filters
function hasFilter(filter, value, currentFilters) {
	for( var i = 0; i < currentFilters.length; i++ ) {
		if( currentFilters[i][filter] == value ) return true;
	}
	return false;
}


// limit the result set to the start / end attr in the query
function setLimits(query, items) {
	logger.info("Setting query limits (start/stop)");
	
	if( query.start > items.length ) return [];
	
	var results = [];
	for( var i = query.start; i < query.end; i++ ) {
		
		if( items[i] ) {
			results.push(items[i]);
		} else {
			// TODO: why would this ever be null?
			//results.push({});
		}
		
		
		// we reached the end
		if( i-1 == items.length ) break;
	}
	
	return results;
}

// clear the record of any blacklisted attributes
function cleanRecord(item) {
	if( !item ) return {};
	if( !config.db.blacklist ) return item;
	
	for( var i = 0; i < config.db.blacklist.length; i++ ) {
		if( item[config.db.blacklist[i]] ) delete item[config.db.blacklist[i]];
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