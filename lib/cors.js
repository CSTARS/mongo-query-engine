module.exports = function(config) {
    return function(res) {
        if( config.allowCrossDomain !== false ) {
          res.header('Access-Control-Allow-Origin', '*');
          res.header('Access-Control-Allow-Methods', 'GET');
          res.header('Access-Control-Allow-Headers', 'Content-Type');
        }
    }
};