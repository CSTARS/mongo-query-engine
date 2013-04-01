/**
 * The Mongo Query Engine (MQE)
 */

var DEBUG = true;

var MongoClient = require('mongodb').MongoClient, db, collection, cache, config;
var ObjectId = require('mongodb').ObjectID;

exports.init = function(conf, callback) {
	config = conf;
	
	if( config.debug != null ) DEBUG = config.debug;
	
	MongoClient.connect(config.db.url, function(err, database) {
		if( err ) return console.log(err);
		db = database;
		if( DEBUG ) console.log("Connected to db: "+config.db.url);
		
		callback();
		  
		db.collection(config.db.mainCollection, function(err, coll) { 
			if( err ) return console.log(err);
			if( DEBUG ) console.log("Connected to collection: "+config.db.mainCollection);
			collection = coll;
			
			// make sure all working indexes are set
			ensureIndexes();
		});
		db.collection(config.db.cacheCollection, function(err, cash) { 
			if( err ) return console.log(err);
			if( DEBUG ) console.log("Connected to cache collection: "+config.db.cacheCollection);
			cache = cash;
		});
	});
}

exports.getDatabase = function() {
	return db;
}

exports.getResults = function(req, callback) {
	if( !db || !collection ) callback({message:"no database connection"});
	if( DEBUG ) console.log("===NEW QUERY REQUEST===");
	
	var query = queryParser(req);
	
	checkCache(query, function(err, result) {
		// if cache err, let console know, but continue on
		if( err ) console.log(err);
		
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
	if( !db || !collection ) callback({message:"no database connection"});
	if( DEBUG ) console.log("===NEW ITEM REQUEST===");
	
	var id = req.query._id;
	
	collection.find({_id: ObjectId(id)}).toArray(function(err, result){
		if( err ) callback(err);
		callback(null, result[0]);
	});
}

exports.update = function(callback) {
	if( !config ) return callback({message:"init has not been call"});
	
	if( DEBUG ) console.log("updating database");
	
	try {
		
		// backup collection
		/*db.collection(config.db.mainCollection+"_"+new Date().getTime(), function(err, backup) { 
			if( err ) return console.log(err);
			if( DEBUG ) console.log("Connected to collection: "+config.db.mainCollection);
			
			collection.find().toArray(function(err, result){
				if( err ) callback(err);
				
				backup.insert(result, {w:1}, function(err, result){
					if( err ) callback(err);
					
					// run imports
					var importScript = require(config.db.importScript);
					importScript.importData(db, function(err){
						if( err ) return callback(err);

						ensureIndexes(function(){
							callback(null); // success
						});
					});
				});
			});
		});*/
		
		// run imports
		var importScript = require(config.db.importScript);
		importScript.importData(db, function(err){
			if( err ) return callback(err);

			ensureIndexes(function(){
				callback(null); // success
			});
		});
		
	} catch (e) {
		console.log(e);
		return callback({message:"error in update"});
	}
}

function ensureIndexes(callback) {
	
	// now set the index
	var options = {};
	for( var i = 0; i < config.db.textIndexes.length; i++ ) {
		options[config.db.textIndexes[i]] = "text";
	}
	
	collection.ensureIndex( options, { name: "TextIndex"}, function(err) {
		if( err ) {
			console.log("Error creating text index: ");
			console.log(err);
		}
	});
	
	for( var i = 0; i < config.db.indexedFilters.length; i++ ) {
		options = {};
		options[config.db.indexedFilters[i]] = 1;
		collection.ensureIndex( options, function(err) {
			if( err ) {
				console.log("Error creating index: ");
				console.log(err);
			}
		});
	}
}

// texts in the express request object, parses out request
// sets defaults and sanity checks
function queryParser(req) {
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
		console.log(e);
	}

	if( !(query.filters instanceof Array) ) {
		query.filters = [ query.filters ];
	}
	
	return query;
}

// check the cached collection for the query, if exsits return
// otherwise send null
function checkCache(query, callback) {
	if( DEBUG ) console.log("Checking cache");

	cache.find({ 'query.text': query.text, 'query.filters': JSON.stringify(query.filters) }).toArray(function(err, items) {
		if( err ) return callback(err);
		
		// get cached items
		if( items.length > 0 ) {
			if( DEBUG ) console.log("Cache Hit");
			var cacheResult = items[0];
			
			cacheResult.query.filters = JSON.parse(cacheResult.query.filters);
			
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
					if( err ) return callback(err);
				
					cacheResult.items = items;
					callback(null, cacheResult);
				});
				return;
			}
			
			// it's empty ... hummmm
			sendEmptyResultSet(query, callback);
			return;
		}
		if( DEBUG ) console.log("Cache miss");
		
		// cache miss
		callback(null, null);
	});
}

// performs a text and filter (optional) query
function textQuery(query, callback) {
	if( DEBUG ) console.log("Running text query: ");
	
	var command = {
		text: config.db.mainCollection,  
		search : query.text,
		limit  : 100000
	};
	
	if( query.filters.length > 0 ) command.filter = { $and : query.filters }
	
	if( DEBUG ) console.log(command);
	
	db.executeDbCommand(command, function(err, resp) {
		if( err ) return callback(err);
		
		// make sure we got something back from the mongo
		if( resp.documents.length == 0 || !resp.documents[0].results || resp.documents[0].results.length == 0 ) {
			return sendEmptyResultSet(query, callback);
		}
		
		var items = [];
		for( var i = 0; i < resp.documents[0].results.length; i++ ) {
			items.push(resp.documents[0].results[i].obj);
		}
		
		handleItemsQuery(query, items, callback);
	});
}

// performs just a filter query
function filterQuery(query, callback) {	
	if( DEBUG ) console.log("Running filters only query: ");
	
	var options = {}
	if( query.filters.length > 0 ) options["$and"] = query.filters;
	
	if( DEBUG ) console.log(options);

	collection.find(options).toArray(function(err, items) {
		if( err ) return callback(err);
		
		handleItemsQuery(query, items, callback);
	});
}

function handleItemsQuery(query, items, callback) {
	if( DEBUG ) console.log("Handling response");
	
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
	
	// sort items
	items.sort(function(a,b) {
		if( a[config.db.sortBy] < b[config.db.sortBy] ) return -1;
		if( a[config.db.sortBy] > b[config.db.sortBy] ) return 1;
		return 0;
	});
	
	
	response.total = items.length;
	

	response.filters = getFilters(items, query.filters);
	response.query = query;
	response.items = items;
	setCache(response);
	
	response.items = setLimits(query, items);
	
	// I know this seems backwards, but we always want to cache the filters
	// so we run that and then remove if filters were not requested
	if( !query.includeFilters ) {
		delete response.filters;
	}
	
	callback(null, response);
}

function setCache(response) {
	if( DEBUG ) console.log("Setting cache");
	
	var cacheItem = {
		query : {
			filters : JSON.stringify(response.query.filters),
			text    : response.query.text
		},
		items   : [],
		filters : response.filters,
		total   : response.total
	};
	
	for( var i = 0; i < response.items.length; i++ ) {
		cacheItem.items.push(response.items[i]._id);
	}
	
	cache.insert(cacheItem, {w:1}, function(err, result){
		if( err ) return console.log(err);
	});
}

// find all filters for query
function getFilters(items, currentFilters) {
	if( DEBUG ) console.log("Aggergating results for filter counts");
	
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
			
			// does this item have the filter and is it an array
			if( item[filter] && (item[filter] instanceof Array)  ) {
				
				// loop through the filters array and increment the filters count
				for( var j = 0; j < item[filter].length; j++ ) {
					value = item[filter][j];
					if( filters[filter][value] ) filters[filter][value]++;
					else filters[filter][value] = 1;
				}
				
			}
			
		}
		
	}
	
	// loop through and remove everything in the current query
	for( var i = 0; i < currentFilters.length; i++ ) {
		for( var f in currentFilters[i] ) {
			if( filters[f] && filters[f][currentFilters[i][f]] ) delete filters[f][currentFilters[i][f]];
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
	
	return filters;
}

// limit the result set to the start / end attr in the query
function setLimits(query, items) {
	if( DEBUG ) console.log("Setting query limits (start/stop)");
	
	if( query.start > items.length ) return [];
	
	var results = [];
	for( var i = query.start; i < query.end; i++ ) {
		
		if( items[i] ) {
			results.push(items[i]);
		} else {
			// TODO: why would this ever be null?
			results.push({});
		}
		
		
		// we reached the end
		if( i-1 == items.length ) break;
	}
	
	return results;
}

// send back and empty result set
function sendEmptyResultSet(query, callback) {
	if( DEBUG ) console.log("Sending default empty result set");
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