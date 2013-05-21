var CERES = {};

CERES.mqe = (function(){
	
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
	var cQuery = null;
	var lastSearchHash = ["search"];
	var host = "";
	
	function init(default_page, host_url) {
		defaultPage = default_page;
		host = host_url ? host_url : "";
		
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
		var hash = window.location.hash.replace("#",'');
		if( !hash ) hash = defaultPage;
		
		var parts = hash.split("/");
		for( var i = 0; i < parts.length; i++ ) parts[i] = decodeURIComponent(parts[i]);
		
		$(window).trigger("page-update-event", [parts]);
		
		cPage = parts[0];
		
		_updatePageContent(parts);
	}
	

	
	function _updatePageContent(hash) {
		if ( cPage == "search" ) {
			_updateSearch(hash);
		} else if ( cPage == "result" ) {
			_updateResult(hash);
		}
	}
	
	function _updateSearch(hash) {
		// set this for the back button
		lastSearchHash = hash;
		
		var search = $.extend({}, DEFAULT_SEARCH);
		
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
		
		cQuery = search;
		
		$.get(host+'/rest/query?text='+search.text + 
				'&filters=' + JSON.stringify(search.filters) + 
				'&start=' + (search.page*search.itemsPerPage) +
				'&end=' + ((search.page+1)*search.itemsPerPage) +
				'&includeFilters=true',
			function(data) {
				$(window).trigger("search-update-event",[data]);  
			}
		);
	}
	
	function _updateResult(hash) {
		$.get(host+'/rest/get?_id='+hash[1],
			function(data) {
				$(window).trigger("result-update-event",[data]);  
			}
		);
	}
	
	function getCurrentQuery() {
		return $.extend(true, {}, cQuery);
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
		getCurrentQuery : getCurrentQuery
	};
	
})();