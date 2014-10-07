/**
 * Super simple in-memory cache
 *  -> TODO: replace with cache control headers
 **/
var cache = {};
var MAX_ITEMS = 100;
var MAX_AGE = 1000*60*60;
var INTERVAL = 1000*60*15;

// check the cache, if hit, update time
exports.check = function(key) {
	if( cache[key] ) {
		//cache[key].timestamp = new Date().getTime();
		var item = JSON.parse(cache[key].value);
		item.cached = true;
		item.timestamp = cache[key].timestamp;
		return item;
	}
	return null;
}

exports.clear = function() {
	cache = {};
}

// set the cache, if full, remove oldest
exports.set = function(key, value) {
	cache[key] = {
		timestamp : new Date().getTime(),
		value     : value
	}

	// make sure we haven't gone over the limit of cached items
	if( Object.keys(cache).length > MAX_ITEMS ) {
		removeOldest();
	}
}

// remove the oldest item from the cache
function removeOldest() {
	var oldestKey = null;
	var oldestTime = new Date().getTime();
	for( var key in cache ) {
		if( cache[key].timestamp < oldestTime ) {
			oldestKey = key;
			oldestTime = cache[key].timestamp;
		}
	}

	if( oldestKey != null ) {
		delete cache[oldestKey];
	}
}

// clear every 15min
setInterval(function(){
	var t = new Date().getTime();
	for( var key in cache ) {
		if( (t - cache[key].timestamp) > MAX_AGE ) {
			delete cache[key];
		}
	}
}, INTERVAL);