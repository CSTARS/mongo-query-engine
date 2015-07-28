MongoQueryEngine
================

Restful, free text and filter based, API and backend using MongoDB

The MongoQueryEngine (MQE) is library you can use to add middleware to your express application.  The MQE provides a query layer for items stored in MongoDB.  The Rest interface provides both filter based expressions as well as free text search.  The interface also provides pagination.  Finally there is a small helper jQuery library that can be loaded to use with your fontend.  The library helps with query creation and parsing as well as app routing.  Finally, the MQE adds SEO support.

#### Starting MQE Application
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

#### config
The MQE uses an config.js file to specify various options for the MQE application.  Theres parameters include, database configuration and express configuration.

Here is on overview:
```
{
	db : { // config for MongoDB
	  // connection string for the database
	  url             : "mongodb://localhost:27017/wcga",

	  // collection where the queryable items are stored
	  mainCollection  : "myDataCollection",

	  // primary filters.  these filters will have indexes created for theme as well as have remaining
	  // counts show in queries.   These attributes are probably your 'suggestions' for further filtering.
	  indexedFilters  : ['keywords','organization','anotherAttribute'],  

	  // currently MQE only allows one sort option, place the attribute you wish to sort on here
	  sortBy : 'title',

	  // attributes that will be used in the text search.  Mongo only allows for one text index.  This list of
	  // attributes will be combined into that index and ensured on start.
	  textIndexes       : ['title','description','organization','anotherAttribute'],

	  // attributes that should not be returned in the response objects
	  blacklist : ['_id', 'md5','secret'],

	  // mark this flag if you mainCollection is the result of a MapReduce opperation.  MQE will handle the marshalling
	  // of the 'value' namespace.
	  isMapReduce     : true
	},
	server : {
	  // server host url
	  host : "localhost",

	  // port outside world goes to.  most likely 80
	  remoteport : 80,

	  // local port on machine
	  localport : 3003,

	  // remote hosts that are allowed to access this sites mqe
	  allowedDomains : ["testnode.com","localhost","192.168.1.113"],
	}
}
```
