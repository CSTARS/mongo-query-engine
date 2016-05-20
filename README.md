MongoQueryEngine
================

Restful, free text and filter based, API and backend using MongoDB

The MongoQueryEngine (MQE) is library you can use to add middleware to your express application.  The MQE provides a query layer for items stored in MongoDB.  The Rest interface provides both filter based expressions as well as free text search.  The interface also provides pagination.  Finally there is a small helper jQuery library that can be loaded to use with your fontend.  The library helps with query creation and parsing as well as app routing.  Finally, the MQE adds SEO support.

# Starting MQE Application
To add the MQE middleware to your app simply add app the following to your express app.
```
var express = require('express');
var app = express();
var http = require('http');
var mqeLib = require('MongoQueryEngine');

mqeLib.init({
    config: require('/path/to/config.js'), // see below
    app: app,
    express: express,
  }, function(){
  /**
   * Setup contains express, app, database, collection and mqe
   */
    var setup = mqeLib.getSetup();

    var server = http.createServer(app);
    var server.listen(3000);
  }
);
```

# config
The MQE uses an config.js file to specify various options for the MQE application.  Theres parameters include, database configuration and express configuration.

Here is on overview:
```

{ // main 
	  // collection where the queryable items are stored
	  collection  : "myDataCollection",

	  // primary filters.  these filters will have indexes created for theme as well as have remaining
	  // counts show in queries.   These attributes are probably your 'suggestions' for further filtering.
	  indexedFilters  : ['keywords','organization','anotherAttribute'],  

	  // currently MQE only allows one sort option, place the attribute you wish to sort on here
	  sortBy : 'title',

	  // attributes that will be used in the text search.  Mongo only allows for one text index.  This list of
	  // attributes will be combined into that index and ensured on start.
	  textIndexes       : ['title','description','organization','anotherAttribute'],

	  // default projection
	  projection : {
			_id : 0, 
			md5 : 0,
			secret : 0
		},

	  // mark this flag if you collection is the result of a MapReduce opperation.  MQE will handle the marshalling
	  // of the 'value' namespace.
	  isMapReduce     : true,
		
		// set to false to disable CORS access
		allowCrossDomain : true,
		
		// when generating the sitemap.xml file, information is used.
		// if not provided, a sitemap.xml file will not be served.
		seo : {
			// host you are serving from
			host : 'http://localhost:3000',
			
			// if you want to use another (non-hash) parameter in url
			// sitemap will show: [host]/[parameterformat][result_id]
			// parameterformat defaults to: #result/
			parameterFormat : '?result=',
		},
		
		// set custom endpoints
		rest : {
			get : '/package/get',
			query : '/package/query'
		},
		
		
		// enable logging
		logging: {
			dir : "/var/log/myapp",

			// max log size
			maxsize : 10485760
		}
}
```

## Post Process Responses

You post process the 'get' and 'query' responses by adding additional config to mqeLib.init(). Example:

```
mqeLib.init({
    config: config,
    app: app,
    express: express,
    process : {
      get : function(params, item, callback) {
        // do stuff here
        callback(item);
      },
      query : function(params, items, callback) {
        // do stuff here
        callback(items);
      }
    }
});
```

As you see in the example above, each process function will be handed the query
parameters from the request, the item or items in the response and a callback
for when you are finished.
