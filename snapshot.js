/**
 * Use zombie.js to take a snapshot of a page for search bot crawlability.
 * Run on seperate thread for safty.
 *
 * Your page needs to set window.__mqe_lploaded flag when landing page loads
 * Check that window.__mqe_lpready isn't set, if so, fire.
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


browser = new Browser();
try {
	browser.visit(url, function () {
		if( browser.window.__mqe_lploaded ) {
			ready();
		} else {
			browser.window.__mqe_lpready = function() {
				ready();
			};
		}
	});
} catch (e) {
	browser.close();
	delete browser;
	console.error(404);
}