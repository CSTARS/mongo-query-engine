MongoQueryEngine
================

Restful, free text and filter based, API and backend using MongoDB

The MongoQueryEngine (MQE) is library you can use to boostrap your express application.  The MQE provides a query layer for items stored in MongoDB.  The Rest interface provides both filter based expressions as well as free text search.  The interface also provides pagination.  Finally there is a small helper jQuery library that can be loaded to use with your fontend.  The library helps with query creation and parsing as well as app routing.  Finally, the MQE adds SEO support.

#### Starting MQE Application
To start an MQE app, you simply run
```
node server /full/path/to/your/config.js
```

#### config.js
The MQE uses an config.js file to specify various options for the MQE application.  Theres parameters include, database configuration and express configuration.

Here is on overview:
```
// what node command to run.  This is just 'node' by default.  This can also by /path/to/local/install/bin/node
exports.node = 'node';

// config for MongoDB
exports.db = {
	// start command for mongo
	// my default the MQE will attempt to start MongoDB if it cannot connect on start.  The MQE will also use
	// this command to restart the database if it is disconnected.
	initd           : "mongod --port 27017",

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
}

exports.server = {
  // server host url
  host : "localhost",
	
	// port outside world goes to.  most likely 80
	remoteport : 80,
	
	// local port on machine
	localport : 3003,
	
	// remote hosts that are allowed to access this sites mqe
	allowedDomains : ["testnode.com","localhost","192.168.1.113"],
	
	// server module to bootstrap
	script : "/path/to/your/server/server.js"
}

exports.logging = {
	dir : "/var/log/myapp",
	
	// max log size
	maxsize : 10485760
}
```
