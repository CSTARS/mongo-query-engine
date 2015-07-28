/*
    sitemap and snapshot logic for seo
*/
var cp = require('child_process');
var logger, config, app, collection;

module.exports.init = function(setup) {
  logger = setup.logger;
  config = setup.config;
  app = setup.app;
  collection = setup.collection;

  // return xml sitemap for all urls
  app.get('/rest/sitemap', function(req, res){
      logger.info('/sitemap request recieved');

      getSitemap(req, function(result){
          if( result.error ) return res.send(result);
          res.set('Content-Type', 'text/xml; charset=utf-8');

          res.send(result.xml);
          logger.info('/sitemap response sent');
      });
  });
};

// middleware to handle _escaped_fragment_ requests
// this allows google and (others?) to crawl mqe sites
// https://support.google.com/webmasters/answer/174992?hl=en
module.exports.escapedFragments = function(req, res, next) {
    if( !req.query._escaped_fragment_ ) return next();
    try {
        generateStaticSnapshot(req, res);
    } catch(e) {
        res.send({error:true,message:'error generating snapshot'});
        logger.error('Error w/ escapedFragment request:');
        logger.error(e);
    }
};


// creates a bot readable snapshot of the landing page
function generateStaticSnapshot(req, res) {
    logger.info('snapshot request recieved');

    var url = "http://localhost"+(config.server.localport ? ":"+config.server.localport : "");
    if( !url.match(/\/?/) ) url += "/";
    url = url+"/snapshot.html#"+req.query._escaped_fragment_;

    logger.info('snapshot url: '+url);

    var err = '';
    var html = '';

    if( !config.node ) {
        return res.send({error: true, message: 'bin/node not set in config'});
    }

    /* exec */
    var t = new Date().getTime();
    cp.exec(config.node+' '+__dirname+'/snapshot.js \''+url+'\'',
        { encoding: 'utf8',
          timeout: 5000*60,
          //maxBuffer: 200*1024,
          killSignal: 'SIGKILL'
          //cwd: null,
          //env: null
        },
        function (error, stdout, stderr) {
            debugger;
            if( error != null ) {
                logger.error('error generating snapshot');
                return res.send({error: true, message: 'error generating snapshot'});
            } else if ( stderr.length > 0 ) {
                logger.error('error generating snapshot');
                return res.send({error: true, message: 'error generating snapshot'});
            }

            logger.info('snapshot generation complete: '+url);
            res.send(stdout);
        }
    );
}

function getSitemap(req, callback) {
    if( !collection ) {
        logger.error('no database connection for mqe.getSitemap()');
        return callback({error:true, message:"no database connection"});
    }

    var host = req.query.host;
    var id = req.query.id;

    if( !host && config.server.host ) {
        host = 'http://'+config.server.host;
    } else if( !host ) {
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
                        '<loc>'+host+'#!result/'+items[i][id]+'</loc>'+
                        '<changefreq>weekly</changefreq>'+
                        '<priority>.5</priority>'+
                    '</url>';
        }
        xml += '</urlset>';

        callback({xml:xml});
    });
}
