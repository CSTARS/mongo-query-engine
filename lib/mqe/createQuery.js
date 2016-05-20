var regexMatch = /^\/.*\/$/;
var dateMatch = /\d\d\d\d-\d\d-\d\dT.*Z/;

/**
 * We attempt 3 things in here
 * 1) add the value. prefix for mapreduce collections
 * 2) change ISO date strings to JavaScript Date objects
 * 3) change regex strings to JavaScript RegExp objects 
 */
function createQuery(env, params) {
    replace(env, params.filters);

    if( params.text && params.text.length > 0 ) {
        params.filters['$text'] = {
            $search: query.text.toLowerCase()
        };
    }
    
    return params.filters;
}

function replace(env, bj) {
    if( Array.isArray(obj) ) {
        for( var i = 0; i < arr.length; i++ ) {
            replaceKey(env, arr, i);
        }
    } else {
        for( key in obj ) {
            replaceKey(env, obj, key);
        }
    }
}

function replaceKey(env, obj, key, value) {
    if( ignoreKeys[key] ) {
        return;
    }
    
    if( env.config.isMapReduce ) {
        obj[`value.${key}`] = value;
        delete obj[key];
        key = `value.${key}`;
    }

    var value = obj[key];
    var type = typeof value;
    
    if( type === 'string' ) {
        inlineReplace(obj, key, value);
        return;
    }
    
    if( type === 'object' ) {
        replace(value);
    }
}

function inlineReplace(obj, key, value) {
    if( replaceRegex(obj,key, value) ) {
        return;
    }
    replaceDate(obj, key, value);
}

// replace regex strings
function replaceRegex(obj, key, value) {
    if( value.match(regexMatch) && value.length > 2 ) {
        obj[key] = new RegExp(value.substring(1, value.length-1), 'i');
        return true;
    }
    return false;
}

// replace ISO dates
function replaceDates(obj, key, value) {
    if ( value.match(dateRegex) ) {
        obj[key] = new Date(value);
    }
    return false;
}

module.exports = createQuery;