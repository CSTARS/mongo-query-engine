window.MQE = (function(){
	
	var defaultPage = "";
	var DEFAULT_SEARCH = {
		text         : "",
		filters      : [],
		page         : 0,
		itemsPerPage : 6
	};
	var HASH_SEARCH_ORDER = ["text","filters","page","itemsPerPage"];
	
	var cPage = "";
	var cPath = "";
	var cRest = '';
	var cQuery = null;
	var lastSearchHash = ["search"];
	var host = "";
	var resultPage = "result";
	var resultQueryParameter = "_id";
	
	/**
	 * options
	 * 
	 *  defaultPage - where to take user if no or unknown page is provided
	 *  hostUrl - if app is launched cross domain, this tells us where to query
	 *  resultPage - Default (result).  url location of result page
	 *  resultQueryParameter - Default (_id).  Unique parameter to retrive item by
	 * 
	 * */
	function init(options) {
		if( typeof options == "string" ) {
			return alert("mqe.js options should be a an object.");
		}
		
		defaultPage = options.defaultPage;
		host = options.hostUrl ? options.hostUrl : "";
		if( options.resultPage ) resultPage = options.resultPage;
		if( options.resultQueryParameter ) resultQueryParameter = options.resultQueryParameter;
		
		_parseUrl();
		
		$(window).on("hashchange", function(){
			_parseUrl();
		});
		
		$(window).bind("back-to-search-event", function(){
			var hash = "#";
			for( var i = 0; i < lastSearchHash.length; i++ ){
				hash += encodeURIComponent(lastSearchHash[i]);
				if( i < lastSearchHash.length - 1 ) hash += "/";
			}
			window.location = hash;
		});
	}
	
	function _parseUrl() {
		// FF returns the hash as unescaped text, so the splits
		// later on break :/ boooo, appears to work if you manually find the hash
		//var hash = window.location.hash.replace("#",'');
		var hash = null;
		if( window.location.href.match(/.*#.*/) ) {
			// if we are using the ajax crawlable #!, make sure we clear it
			hash = window.location.href.split("#")[1].replace(/^!/,"");
		}
		
		if( !hash ) hash = defaultPage;
		
		var parts = hash.split("/");
		for( var i = 0; i < parts.length; i++ ) parts[i] = decodeURIComponent(parts[i]);
		
		$(window).trigger("page-update-event", [parts]);
		
		cPage = parts[0];
		
		_updatePageContent(parts);
	}
	

	
	function _updatePageContent(hash) {
		if ( cPage == "search" ) {
			updateSearch(hash);
		} else if ( cPage == resultPage ) {
			_updateResult(hash);
		}
	}
	
	function updateSearch(hash) {
		$(window).trigger("search-start-event");

		// set this for the back button
		lastSearchHash = hash;
		
		cQuery = getSearchObject(hash);
		cRest = getRestUrl(cQuery);

		$.get(cRest,
			function(data) {
				$(window).trigger("search-update-event",[data]);  
			}
		);
	}

	function getRestUrl(query) {
		return host+'/rest/query?text='+query.text + 
				'&filters=' + encodeURIComponent(JSON.stringify(query.filters)) + 
				'&start=' + (query.page*query.itemsPerPage) +
				'&end=' + ((query.page+1)*query.itemsPerPage);
	}

	function getSearchObject(hash) {
		var search = $.extend(true, {}, DEFAULT_SEARCH);
		
		for( var i = 1; i < hash.length; i++ ) {
			if( hash[i].length > 0 ) {
				search[HASH_SEARCH_ORDER[i-1]] = hash[i];
			}
		}
		
		try {
			if( typeof search.filters == 'string' ) {
				search.filters = JSON.parse(search.filters);
			}
		} catch (e) {
			console.log(e);
		}
		
		for( var i = 0; i < DEFAULT_SEARCH.filters.length; i++ ) {
			var f = DEFAULT_SEARCH.filters[i];
			var key = "";
			for( key in f ) break;
			
			var found = false;
			for( var j = 0; j < search.filters.length; j++ ) {
				if( search.filters[j][key] == f[key] ) {
					found = true;
					break;
				}
			}
			if( !found ) search.filters.push(f);
		}
		
		try {
			if( typeof search.page == 'string' ) {
				search.page = parseInt(search.page);
			}
			if( typeof search.itemsPerPage == 'string' ) {
				search.itemsPerPage = parseInt(search.itemsPerPage);
			}
		} catch(e) {
			console.log(e);
		}

		return search;
	}
	
	function _updateResult(hash) {
		$.get(host+'/rest/get?'+resultQueryParameter+'='+hash[1],
			function(data) {
				
				// make sure something was returned...
				var error = false;
				if( data.error ) error = true;

				$(window).trigger("result-update-event",[data, error]);  
			}
		);
	}

	function setDefaultFilter(filter) {
		DEFAULT_SEARCH.filters.push(filter);
	}
	
	
	function getDefaultQuery() {
		return $.extend(true, {}, DEFAULT_SEARCH);
	}
	
	function getCurrentQuery() {
		return $.extend(true, {}, cQuery);
	}

	function getResultPage() {
		return resultPage;
	}

	function getRestLink() {
		return cRest;
	}
	
	function queryToUrlString(query) {
		var hash = "#search";
		for( var i = 0; i < HASH_SEARCH_ORDER.length; i++ ) {
			if( query[HASH_SEARCH_ORDER[i]] != null) {
				if( typeof query[HASH_SEARCH_ORDER[i]] == 'object' ) {
					hash += "/"+encodeURIComponent(JSON.stringify(query[HASH_SEARCH_ORDER[i]]));
				} else {
					hash += "/"+encodeURIComponent(query[HASH_SEARCH_ORDER[i]]);
				}
			} else {
				hash += "/";
			}
		}
		return hash;
	}
	
	
	return {
		init : init,
		queryToUrlString : queryToUrlString,
		getCurrentQuery : getCurrentQuery,
		getDefaultQuery : getDefaultQuery,
		getResultPage : getResultPage,
		setDefaultFilter : setDefaultFilter,
		getRestLink : getRestLink,
		updateSearch : updateSearch,
		getSearchObject : getSearchObject,
		getRestUrl : getRestUrl
	};
	
})();