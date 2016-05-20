/*
    sitemap and snapshot logic for seo
*/

module.exports = function(env) {
  var logger = env.logger;
  var config = env.config;
  var app = env.app;


  // return xml sitemap for all urls
  if( config.seo ) {
    app.get('/sitemap.xml', (req, res) => {
        logger.info('/sitemap.xml request recieved');

        getSitemap(env, req, (result) => {
            if( result.error ) return res.send(result);
            res.set('Content-Type', 'text/xml; charset=utf-8');

            res.send(result.xml);
            logger.info('/sitemap response sent');
        });
    });
  }

  app.get('/robots.txt', (req, res) => {
      logger.info('/robots.txt request recieved');
      res.set('Content-Type', 'text/plain');
      res.send('User-agent:*\nDisallow:'+(config.seo ? '\nSitemap: /sitemap.xml' : ' /'));
  });
};

function getSitemap(env, req, callback) {
    if( !env.collection ) {
        env.logger.error('no database connection for mqe.getSitemap()');
        return callback({error:true, message:'no database connection'});
    }

    var host = req.query.url;
    var id = req.query.id;

    if( !host && config.seo.host ) {
        host = config.seo.host;
    } else if( !host ) {
        host = '/';
    }
    if( !id ) {
        id = '_id';
    }

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

        var xml = 
`<?xml version='1.0' encoding='UTF-8'?>
    <urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9>
    <url>
        <loc>${host}</loc>
        <changefreq>weekly</changefreq>
        <priority>1</priority>
    </url>`;

        var slug = config.seo.parameterFormat ? config.seo.parameterFormat : '#result/';
        for( var i = 0; i < items.length; i++ ) {
            xml += 
    `<url>
        <loc>${host}${slug}${items[i][id]}</loc>
        <changefreq>weekly</changefreq>
        <priority>.5</priority>
    </url>`;
        }
        xml += '</urlset>';

        callback({xml:xml});
    });
}
