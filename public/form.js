Handlebars.registerHelper('mqe-form-multiselect', function(items, options) {
  var out = "<ul>";
  for(var i=0, l=items.length; i<l; i++) {
	  if( items[i] != "__value__") {
		  out += "<li><label class='checkbox'><input type='checkbox'> "+items[i]+"</label></li>"
	  } else {
		  out += "<li><label class='checkbox'><input type='checkbox'> Other: <input type='text' /></label></li>"
	  }
	  	
  }
  return out+"</ul>";
});

Handlebars.registerHelper('mqe-form-multiradio', function(block, options) {
	  var out = "<ul>";
	  for(var i=0, l=block.values.length; i<l; i++) {
		  out += "<li><label class='checkbox'><input type='radio' name='"+block.id+"'> "+block.values[i]+"</label></li>";
	  }
	  return out+"</ul>";
	});

/**
 * Requires Handlebars.js and Bootstrap
 */
MQE.form = (function(){
	
	var text = [
	            '<div class="form-group" id="{{prefix}}-{{key}}-group">',
	            	'<label>{{label}}</label>',
	            	'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
	            	'<input type="text" id="{{prefix}}-{{key}}" placeholder="{{label}}" />',
	            '</div>'
	     ].join('');
	
	var textarea = [
				'<div class="form-group" id="{{prefix}}-{{key}}-group">',
					'<label>{{label}}</label>',
					'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
					'<textarea id="{{prefix}}-{{key}}" placeholder="{{label}}" ></textarea>',
				'</div>'
	].join('');
	
	var boolsingle = [
				'<div class="form-group" id="{{prefix}}-{{key}}-group">',
					'<label>{{label}}</label>',
					'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
					'<label class="checkbox"><input type="checkbox" id="{{prefix}}-{{key}}"> Yes</label>',
				'</div>'
	].join('');
	
	var bool = [
   				'<div class="form-group" id="{{key}}-group">',
   					'<label>{{label}}</label>',
   					'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
   					'<label class="checkbox"><input type="radio" name="{{prefix}}-{{key}}-radio-yes" > Yes</label>',
   					'<label class="checkbox"><input type="radio" name="{{prefix}}-{{key}}-radio-no" > No</label>',
   				'</div>'
	].join('');
	
	var multiselect = [
				'<div class="form-group" id="{{prefix}}-{{key}}-group">',
					'<label>{{label}}</label>',
					'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
					'<ul id="{{prefix}}-{{key}}" placeholder="{{label}}" >',
						'{{#mqe-form-multiselect values}}{{/mqe-form-multiselect}}'
					'</ul>',
				'</div>'
	].join('');
	
	var multiradio = [
   				'<div class="form-group" id="{{prefix}}-{{key}}-group">',
   					'<label>{{label}}</label>',
   					'{{#if help}}<span class="help-block">{{help}}</span>{{/if}}',
   					'<ul id="{{prefix}}-{{key}}" placeholder="{{label}}" >',
   						'{{#mqe-form-multiradio block}}{{/mqe-form-multiradio}}',
   					'</ul>',
   				'</div>'
   	].join('');
	
	var button = [
	            '<div class="control-group">',
	            	'<label class="control-label" for="{{key}}"></label>',
	            	'<div class="controls">',
	            		'<a class="btn {{type}}" id="{{key}}">{{label}}</a>',
	            	'</div>',
	            '</div>'
	].join('');
	
	var saveCancel = [
	            '<div class="control-group">',
	            	'<label class="control-label" for="{{key1}}"></label>',
	            	'<div class="controls">',
	            		'<a class="btn btn-info" id="{{key1}}" style="margin-right:15px">{{label1}}</a>',
	            		'<a class="btn btn-grey" id="{{key2}}">{{label2}}</a>',
	            	'</div>',
	            '</div>'
	].join('');
	
	var templates = {
			text        : Handlebars.compile(text),
			textarea    : Handlebars.compile(textarea),
			multiradio  : Handlebars.compile(multiradio),
			multiselect : Handlebars.compile(multiselect),
			bool        : Handlebars.compile(bool),
			boolsingle  : Handlebars.compile(boolsingle),
			button      : Handlebars.compile(button),
			saveCancel  : Handlebars.compile(saveCancel)
	}
	
	/**
	 * Create an input form
	 * 
	 * prefix (string) - id prefix for all input fields
	 * schema (object) - schema returned from google endpoints
	 * save (function) - handler to be called on save
	 * cancel (function) - handler to be called on cancel
	 */
	function create(options) {
		var attributes = $.extend(true, {}, options.schema);
		
		var form = '<div class="form-horizontal sw-form">';
		
		// create ordered array of from elements (attributes w/ a form order)
		var elements = [];
		for( var i in attributes ) {
			if( attributes[i].order != null ) {
				attributes[i].key = i;
				elements.push(attributes[i]);
			}
		}
		elements.sort(function(a,b) {
			return a.order - b.order;
		});
		
		for( var i = 0; i < elements.length; i++ ) {
			elements[i].key = options.prefix+"-"+elements[i].key;
			if( templates[elements[i].type] ) {
				var t = templates[elements[i].type];
				if( elements[i].typem == "multiradio" ) {
					var ele = elements[i];
					ele.block = {
						values : ele.values,
						id     : prefix+"-"+key+"-radio"
					};
					form += t(ele);
				} else {
					form += t(elements[i]);
				}
			}
		}
		
		// for now assume we want a save button
		form += templates.saveCancel({
			key1   : options.prefix+"-save",
			label1 : "Save",
			key2   : options.prefix+"-cancel",
			label2 : "Cancel"
		});
		
		form += '</div>';
		
		form = $(form);
		
		if( options.save ) form.find("#"+options.prefix+'-save').on('click', options.save);
		if( options.cancel ) form.find("#"+options.prefix+'-cancel').on('click', options.cancel);
		
		return form;
	}
	
	return {
		create: create
	}
	
})();