/**
 * Use zombie.js to take a snapshot of a page for search bot crawlability.
 * Run on seperate thread for safty.
 *
 * NOTE: DO NOT USE CONSOLE.LOG IN HERE!!!
 *  this process communicates to the server using stdout, so you will mess 
 *  with the generated output.  This is bad.
 **/
var Browser = require("zombie");

if( process.argv.length < 3 ) {
	console.log("No url provided");
	return;
} 

var url = process.argv[2];

function ready() {
	// remove all script tags
	browser.window.$("script").remove();

	// remove all styles, not needed
	//browser.window.$("link").remove();

	var html = browser.html();
	browser.close();
	delete browser;

	console.log(html);
}

//var url = "http://"+config.server.host;


browser = new Browser();
try {
	browser.visit(url, function () {
		if( !browser.window.CERES ) {
			browser.window.CERES = {
				mqe : {}
			};
		}

		if( browser.window.CERES.mqe._lploaded ) {
			ready();
		} else {
			browser.window.CERES.mqe.lpready = function() {
				ready();
			};
		}
	});
} catch (e) {
	browser.close();
	delete browser;
	console.error(404);
}