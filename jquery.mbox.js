/*
 * Mbox, City Live version. Inspired by Modybox
 * Version 0.1 alpha (19/02/2010)
 * Requires: jQuery
*/


/*

    Usage examples:

    1. Show mbox:

            $.mbox('title', 'content', { ... });

    2. Show mbox error dialog

            $.mbox_error('title', 'content');

    3. Show mbox when clicking on element

            $('p').mbox('title', 'content', { ...});

    4. Show the image to where this hyperlink points

            $('a').mbox_image()

    5. Process a form in the mbox with an AJAX view

            $.mbox_ajax_form('title', 'form.html', 'Save record');

 */

(function($) {
    // Are we using IE?
    var isIE = ($.browser.msie && parseInt($.browser.version.substr(0,1)) < 8);

    // PNG fix for Internet Explorer
    $.fn.fixPNG = function() {
        return this.each(function () {
            var image = $(this).css('backgroundImage');

            if (image.match(/^url\(["']?(.*\.png)["']?\)$/i)) {
                image = RegExp.$1;
                $(this).css({
                    'backgroundImage': 'none',
                    'filter': "progid:DXImageTransform.Microsoft.AlphaImageLoader(enabled=true, sizingMethod=" +
                                    ($(this).css('backgroundRepeat') == 'no-repeat' ? 'crop' : 'scale') + ", src='" + image + "')"
                }).each(function () {
                    var position = $(this).css('position');
                    if (position != 'absolute' && position != 'relative')
                        $(this).css('position', 'relative');
                });
            }
        });
    };

    // gettext wrapper
    var _ = (typeof gettext == 'undefined' ? function(x) { return x; } : gettext);

    var overlay_opacity = 0.3;

    // Initialisation of HTML nodes
    var initialised = false;

    var mbox_overlay = undefined;
    var mbox_wrap = undefined;
    var mbox_table = undefined;
    var mbox_body = undefined;
    var mbox_title = undefined;
    var mbox_content = undefined;
    var mbox_footer = undefined;

    var loading_image = undefined;

    function init(settings)
    {
        if (! initialised)
        {
            initialised = true;

            $(''
                + '<div id="mbox_overlay" style="display:none;"></div>'
                + '<div id="mbox_wrap" style="display:none;">'
                + '<div id="mbox" style="display:none;">'
                +    '<table id="mbox_table">'
                +        '<tr>'
                +            '<td class="mbox_tl" />'
                +            '<td class="mbox_t" />'
                +            '<td class="mbox_tr" />'
                +        '</tr>'
                +        '<tr>'
                +            '<td class="mbox_l" />'
                +            '<td class="mbox_body">'
                +                '<div class="mbox_title"></div>'
                +                '<div class="mbox_content"></div>'
                +                '<div class="mbox_footer"></div>'
                +            '</td>'
                +            '<td class="mbox_r" />'
                +        '</tr>'
                +        '<tr>'
                +            '<td class="mbox_bl" />'
                +            '<td class="mbox_b" />'
                +            '<td class="mbox_br" />'
                +        '</tr>'
                +    '</table>'
                + '</div>'
                + '</div>'
            ).appendTo('body');

            if (isIE)
                $('.mbox_tl, .mbox_t, .mbox_tr, .mbox_l, .mbox_r, .mbox_bl, .mbox_b, .mbox_br').fixPNG();

            mbox_wrap = $('#mbox_wrap');
            mbox_table = $('#mbox_table');
            mbox_body = $('#mbox_wrap .mbox_body');
            mbox_overlay = $('#mbox_overlay');
            mbox_title = $('#mbox_wrap .mbox_title');
            mbox_content = $('#mbox_wrap .mbox_content');
            mbox_footer = $('#mbox_wrap .mbox_footer');

            function make_draggable(handle, container)
            {
                var body = $('body');

                handle.mousedown(function(event){ 
                    var initX = event.pageX - container.offset().left;
                    var initY = event.pageY - container.offset().top;

                    body.mousemove(function(event){ 
                        container.css({'position': 'absolute',
                                       'left': event.pageX - initX, 
                                       'top': event.pageY - initY
                                      });
                    });

                    body.mouseup(function(event)
                    {
                        body.unbind('mousemove');
                        body.unbind(event);
                    });

                    return false;
                });

                handle.hover(function(){
                    handle.css('cursor', 'move');
                }, function(){ 
                    handle.css('cursor', 'auto'); 
                });
            }
            
            make_draggable(mbox_title, mbox_wrap);

            

            // Loading image
            loading_image = $('<div class="mbox_loading" />').append(
                    $('<img alt="" src="/media/common/img/modybox/loading.gif" />'));

            // Overlay opacity
            mbox_overlay.css('opacity', overlay_opacity);
        }


        // Set mbox body
        if (settings['width'] != undefined)
            $('#mbox_wrap .mbox_body').css('width', settings['width']);
        else
            $('#mbox_wrap .mbox_body').css('width', '');
    }

    // Globals
    DIALOG_OK = 'ok';
    DIALOG_CLOSE = 'close';
    DIALOG_YES_NO = 'yes_no';
    DIALOG_YES_NO_CANCEL = 'yes_no_cancel';

    DIALOG_INFORMATION = 'info';
    DIALOG_ERROR = 'error';
    
    RESPONSE_JSON = 'json'; // example response {'status': 'SUCCESS', 'content': '<p>This is some content!</p>'}
    RESPONSE_TEXT = 'text';

    // Mutex
    var prevent_closing = false;
    function do_while_prevent_closing(actions)
    {
        prevent_closing = true;
        actions();
        prevent_closing = false;
    }

    /* ====[ mbox utilities ]==== */

    $.mbox_error = function(title, content) {
        return $.mbox(title, content, {
                'type': DIALOG_OK,
                'warning_level': DIALOG_ERROR
            });
    };

    $.mbox_ajax_form = function(title, url, save_caption, optional_settings) {
        // Container in which the AJAX view is placed
        var container = $('<div />').html('<img alt="" src="/media/common/img/modybox/loading.gif" />' + _('Loading...'));

        // Create mbox
        var settings = { // These settings cannot be overridden in optional_settings
            'type': DIALOG_YES_NO,
            'btn_caption_yes': save_caption,
            'btn_caption_no': _('Cancel'),
            'callback_yes': function() {
                var close = false;
                mbox_footer.find('input').attr("disabled", "disabled");
                
                $.ajax({
                    'url': url,
                    //'dataType': 'html',
                    'type': 'POST',
                    'data': container.find('form').serialize(),
                    'success': function(data) {
                        close = false;
                        if (optional_settings["callback_ajax_submit_success"] != undefined)
                            close = optional_settings["callback_ajax_submit_success"]($.mbox.element, data);
                        
                        if (close) {
                            $.mbox.close();
                        } else {
                            mbox_footer.find('input').removeAttr("disabled");
                            container.find('input[type=submit]').hide();
                            var content = data;
                            
                            if (optional_settings['response_type'] == RESPONSE_JSON) {
                                var json = $.parseJSON(data);
                                if (json.status == 'SUCCESS') {
                                    close = true;
                                    content = json.content;
                                } else if (json.status == 'ERROR') {
                                    content = json.content;
                                    $('#mbox_wrap').removeClass("mbox_error").addClass("mbox_error");
                                }
                            } else {
                                if (data == 'OK') {
                                    close = true;
                                }
                            }
                            
                            if (close) {
                                if (optional_settings["callback_ajax_posted_success"] != undefined)
                                    optional_settings["callback_ajax_posted_success"]($.mbox.element, content);
                                $.mbox.close();
                            } else {
                                container.html(content);
                                $.mbox.reposition_box();
                            }
                        }
                    },
                    'error': function(jqXHR, textStatus, errorThrown) {
                        mbox_footer.find('input').removeAttr("disabled");
                        $('#mbox_wrap').removeClass("mbox_error").addClass("mbox_error");
                        container.html(_("Woops! Something went wrong. Please try again later."));
                        $.mbox.reposition_box();
                    }
                });
                return close;
            }
        };

        var settings = $.extend(false, { }, optional_settings, settings);
        $.mbox(title, container, settings);

        // Load AJAX content
        $.ajax({
            'url': url,
            'dataType': 'html',
            'success': function(data){
                var close = false;
                if (optional_settings != undefined && optional_settings["callback_ajax_before_loaded"] != undefined)
                    close = optional_settings["callback_ajax_before_loaded"]($.mbox.element, data);
                
                if (close) {
                    $.mbox.close();
                } else {
                    container.html(data);
                    container.find('input[type=submit]').hide();
                    $.mbox.reposition_box();
    
                    if (optional_settings != undefined && optional_settings["callback_ajax_loaded_success"] != undefined)
                        optional_settings["callback_ajax_loaded_success"]($.mbox.element, data);
                }
            },
            'error': function(xhr, ajaxOptions, thrownError){
                $('#mbox_wrap').removeClass("mbox_error").addClass("mbox_error");
                container.html($('<div/>').addClass("error").html(_('Loading error...')).after($('<p/>').html("<br/>" + xhr.status + " " + thrownError)));
                $.mbox.reposition_box();
            }
        });
    };

    /* ====[ mbox class ]==== */

    $.mbox = function(title, content, settings) {
        // Settings is optional
        if (settings)
            settings = $.extend(false, $.mbox.default_settings, settings);
        else
            settings = $.extend(false, $.mbox.default_settings);

        $.mbox.load(settings);
        $.mbox.show(title, settings);
        $.mbox.show_content(content);
        fix_box();
    };

    $.extend($.mbox, {
        'default_settings': {
            'type'                : DIALOG_OK,
            'warning_level'       : DIALOG_INFORMATION,
            'callback_closed'     : null,
            'callback_yes'        : null,
            'callback_no'         : null,
            'callback_closed_yes' : null,
            'callback_closed_no'  : null,
            'btn_caption_yes'     : _('Yes'),
            'btn_caption_no'      : _('No'),
            'btn_caption_cancel'  : _('Cancel'),
            'btn_caption_ok'      : _('Ok'),
            'btn_caption_close'   : _('Close'),
            'show_title'          : 'true',
            'show_footer'         : 'true',
            'response_type'       : RESPONSE_TEXT, // defaults to text so we do not break the current functionality
            'width'               : undefined // automatic width by default
        },

        'load': function(settings) {
            do_while_prevent_closing(function() {
                init(settings);

                // clear content
                mbox_title.empty();
                mbox_content.empty();
                mbox_footer.empty();

                // Set warning level in class name
                mbox_wrap.attr('class', 'mbox_' + settings.warning_level);

                // add loading image
                mbox_content.append(loading_image);

                mbox_overlay.bind('click', function() {$.mbox.close(settings)});
                $('.mbox_loading').bind('click', function() {$.mbox.close(settings)});

                // esc close
                $(document).bind('keydown.mbox', function(e) {
                    if (e.keyCode == 27)
                        $.mbox.close();
                    return true;
                });

                // resize binding
                $(window).bind('resize', scroll);
                
                scroll();
                fix_box();

                // Hide flash objects
                if (isIE)
                    $('embed, object, select').css('visibility', 'hidden');
            });
        },

        'show': function(title, settings) {
            do_while_prevent_closing(function() {
                // Show/hide
                if (settings.show_title)
                {
                    mbox_title.empty();
                    mbox_title.append(title);
                    mbox_title.show();
                }
                else
                    mbox_title.hide();

                if (settings.show_footer)
                {
                    mbox_footer.empty();
                    mbox_footer.append(create_footer(settings));
                    mbox_footer.show();
                }
                else
                    mbox_footer.hide();

                mbox_overlay.show();
                mbox_overlay.css('opacity', overlay_opacity);
                mbox_wrap.show();

                // show box
                scroll();

                // Fadein
                mbox_wrap.children().fadeIn(10);
            });
        },

        'show_content': function(content) {
            do_while_prevent_closing(function() {
                // Replace existing content by new one
                mbox_content.empty();
                mbox_content.append(content);

                // Resize
                scroll();
            });
        },

        'close': function(settings) {
            if (prevent_closing)
                return false;

            // Cleanup
            $(document).unbind('keydown.mbox');
            $(window).unbind('resize');
            mbox_overlay.unbind('click');
            mbox_wrap.find('.mbox_loading').remove();

            // Fadeout
            mbox_wrap.fadeOut(10, function() {
                mbox_overlay.fadeOut('fast', function() {
                    // Empty content/title/footer containers
                    mbox_content.empty();
                    mbox_title.empty();
                    mbox_footer.empty();

                    mbox_wrap.attr('style', '').hide();
                    mbox_table.attr('style', '');
                });
            });

            // Show flash objects again
            if (isIE)
                $('embed, object, select').css('visibility', 'visible');

            // Close callback
            if (typeof(settings) != 'undefined' && $.isFunction(settings.callback_closed))
                settings.callback_closed($.mbox.element);

            return false;
        },

        // Allow usage of $.mbox.scroll(); by external code.
        center_box: scroll,

        // Call $.mbox.reposition_box() for resizing/positioning
        reposition_box: fix_box
    });

    /* ====[ End mbox class ]==== */

    // Handle calls like:  $('element').mbox(title,content,settings)
    $.fn.mbox = function(title, content, settings) {
        // 'settings' is an optional parameter, complete with default settings
        if (settings)
            settings = $.extend(false, $.mbox.default_settings, settings);
        else
            settings = $.extend(false, $.mbox.default_settings);

        init(settings);

        // Override click on this element
        return this.unbind('click').click(function(){
                $.mbox.element = $(this);

                $.mbox.load(settings);
                $.mbox.show(title, settings);
                
                if (content == undefined) {
                    var elem_href = $.mbox.element.attr("href");
                    
                    if (elem_href.match(/#/)) {
                        var url    = window.location.href.split('#')[0];
                        var target = elem_href.replace(url,'');
                        
                        $.mbox.show_content($(target).html());
                        fix_box(settings);
                    }
                    else {
                        $.ajax({
                            url:    elem_href,
                            //data:   ,
                            error:  function() {
                                $.mbox_error(_('Error'), _('<p>The requested data could not be loaded. Please try again.</p>'));
                            },
                            success: function(data, textStatus, XMLHttpRequest) {
                                if (settings['response_type'] == RESPONSE_JSON) {
                                    json = JSON.parse(data);
                                    $.mbox.show_content(json.content);
                                } else {
                                    $.mbox.show_content(data);
                                }
                                fix_box(settings);
                            }
                        });
                    }
                } else {
                    $.mbox.show_content(content);
                    fix_box(settings);
                }

                return false;
            });
    };

    // Handle calls like:  $('element').mbox_image()
    $.fn.mbox_image = function()
    {
        // Settings for image pop-up
        var settings = $.extend(false, $.mbox.default_settings,
                {
                    'type': DIALOG_CLOSE,
                    'show_title': false,
                    'width': 'auto'
                });
        init(settings);

        // Override click on this element
        this.unbind('click').click(function(){

            var href = $(this).attr('href');

            // Show mbox
            $.mbox.element = $(this);

            $.mbox.load(settings);
            $.mbox.show('', settings);
            fix_box();

            // Load image
            var img = new Image();

            img.onerror = function() {
                $.mbox_error(_('Error'), _('<p>The requested data could not be loaded. Please try again.</p>'));
            };

            // When the image has been loaded, show in currently displayed mbox
            img.src = href;
            img.onload = function() {

                img.onerror = null;
                img.onload = null;

                var pos = getViewport();

                var r = Math.min(Math.min(pos[0] - 50, img.width) / img.width,
                                Math.min(pos[1] - 120, img.height) / img.height);

                var width = Math.round(r * img.width);
                var height = Math.round(r * img.height);

                mbox_wrap.css({'left': '', 'top': '', 'width': '', 'height': ''});
                $.mbox.show_content($('<img alt="" />').attr('src', href).attr('width', width).attr('height', height));
                fix_box(settings);
            };

            return false;
        });
        return this;
    };

    // Create footer and connect handlers
    function create_footer(settings) {
        var type = settings.type;
        var p = $('<p/>');

        function add_input(classname, value, click_handler, closed_handler) {
            var input = $('<input type="button" />').attr('class', classname).attr('value', value);
            p.append(input);

            // Handle click on this button
            input.click(function() {
                
                var do_close = true;
                if ($.isFunction(click_handler)) {
                    var return_value = click_handler($.mbox.element);
                    if (return_value != undefined)
                        do_close = return_value;
                }
                if (do_close)
                {
                    $.mbox.close(settings);
                    if ($.isFunction(closed_handler))
                        closed_handler($.mbox.element);
                }
            });
        }

        if (type == DIALOG_YES_NO) {
            add_input('btn_yes', settings.btn_caption_yes, settings.callback_yes, settings.callback_closed_yes);
            add_input('btn_no', settings.btn_caption_no, settings.callback_no, settings.callback_closed_no);
        }
        else if (type == DIALOG_YES_NO_CANCEL) {
            add_input('btn_yes', settings.btn_caption_yes, settings.callback_yes, settings.callback_closed_yes);
            add_input('btn_no', settings.btn_caption_no, settings.callback_no, settings.callback_closed_no);
            add_input('btn_cancel', settings.btn_caption_cancel);
        }
        else if (type == DIALOG_CLOSE)
            add_input('btn_ok', settings.btn_caption_close);

        else
            add_input('btn_ok', settings.btn_caption_ok);

        return p;
    }

    function getViewport () {
        return [$(window).width(), $(window).height(), $(document).scrollLeft(), $(document).scrollTop()];
    };

    // Position box
    function scroll() {
        var pos = getViewport();

        mbox_wrap.css({

        'left' : ((mbox_wrap.width() + 40) > pos[0] ? pos[2] : pos[2] + Math.round((pos[0] - mbox_wrap.width() - 40) / 2)),
        'top'  : ((mbox_wrap.height() + 50) > pos[1] ? pos[3] : (pos[3] + Math.round((pos[1] - mbox_wrap.height() - 50) / 2)))

        });
    };

    // Resize box
    function fix_box(settings) {
        var pos = getViewport();

        // content width
        var width = mbox_body.width() + 20;

        // Minimum width
        if (settings == undefined) {
            if (width < 500) {
                width = 500;
            }
        }
        else {
            if (settings.width) {
                width = settings.width;
            }
        }

        // Width should not be more than the window's width
        if (width > pos[0])
            width = pos[0] * 0.80;

        mbox_wrap.css('width', width+'px');
        mbox_table.css('width', '100%');

        //if (typeof skip_height == undefined || !skip_height)
        //    mbox_content.css('height', '300px');

        // Make sure the modybox is not heiger than the window
        mbox_content.css('height', "");
        height = mbox_body.height();
        if (height > pos[1])
        {
            height = pos[1] * 0.80;
            if (height > 40) {
                height -= 40;
            }
            mbox_content.css('height', height + "px");
        }

        scroll();
    }
}) (jQuery);
