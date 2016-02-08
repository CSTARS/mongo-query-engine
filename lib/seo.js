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

  if( config.seo !== false ) {
    config.seo = true;
  }

  // return xml sitemap for all urls
  if( config.seo ) {
    app.get('/sitemap.xml', function(req, res){
        logger.info('/sitemap.xml request recieved');

        getSitemap(req, function(result){
            if( result.error ) return res.send(result);
            res.set('Content-Type', 'text/xml; charset=utf-8');

            res.send(result.xml);
            logger.info('/sitemap response sent');
        });
    });
  }

  app.get('/robots.txt', function(req, res){
      logger.info('/robots.txt request recieved');
      res.set('Content-Type', 'text/plain');
      res.send('User-agent:*\nDisallow:'+(config.seo ? '\nSitemap: /sitemap.xml' : ' /'));
  });
};

function getSitemap(req, callback) {
    if( !collection ) {
        logger.error('no database connection for mqe.getSitemap()');
        return callback({error:true, message:'no database connection'});
    }
    console.log(config);

    var host = req.query.url;
    var id = req.query.id;

    if( !host && config.server.url ) {
        host = config.server.url;
    } else if( !host ) {
        logger.error('no host provided');
        return callback({error:true, message:'no host provided'});
    }
    if( !id ) id = '_id';

    options = {title:1};
    options[id] = 1;

    collection.find({},options).toArray(function(err, items){
        if( err ) {
            logger.error(err);
            return callback(err);
        }

        if( !items ) {
            logger.error('Bad response from query: '+JSON.stringify(options));
            return callback({error:true,message:'Bad response from query'});
        }

        if( !host.match(/\/$/) ) host = host + '/';

        var xml = '<?xml version=\'1.0\' encoding=\'UTF-8\'?>'+
                  '<urlset xmlns=\'http://www.sitemaps.org/schemas/sitemap/0.9\'>'+
                    '<url>'+
                        '<loc>'+host+'</loc>'+
                        '<changefreq>weekly</changefreq>'+
                        '<priority>1</priority>'+
                    '</url>';

        for( var i = 0; i < items.length; i++ ) {
            xml += '<url>'+
                        '<loc>'+host+(config.seoFormat ? config.seoFormat : '#result/')+items[i][id]+'</loc>'+
                        '<changefreq>weekly</changefreq>'+
                        '<priority>.5</priority>'+
                    '</url>';
        }
        xml += '</urlset>';

        callback({xml:xml});
    });
}
