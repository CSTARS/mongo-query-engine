var page = require('webpage').create();
var system = require('system');
var next = false;

page.onConsoleMessage = function(msg) {
  if( next ) {
    console.log(msg);
    next = false;
  } else if( msg === '__PHANTOM_MQE_DUMP__' ){
    next = true;
  } else {
    next = false;
  }
};
/*page.onError = function (msg, trace) {
    console.log(msg);
    trace.forEach(function(item) {
        console.log('  ', item.file, ':', item.line);
    });
};*/

page.open(system.args[1], function(status) {
  page.evaluate(function() {
		$('script').remove();
		
    if( window.__mqe_lploaded ) {
      console.log('__PHANTOM_MQE_DUMP__');
			console.log('<html>'+document.documentElement.innerHTML+'<html>');
		// wait for ready event
		} else {
			window.__mqe_lpready = function(){
        console.log('__PHANTOM_MQE_DUMP__');
				console.log('<html>'+document.documentElement.innerHTML+'<html>');
      };
		}
  });
  phantom.exit();
});
