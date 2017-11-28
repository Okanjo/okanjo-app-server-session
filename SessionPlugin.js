'use strict';

const baseId = require('base-id');

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Register the core authentication mechanisms for use with routes
 * @param {OkanjoServer} server – Okanjo server instance to bind to
 * @param {*} sessionConfig – Server Session plugin config
 * @param cache - Catbox cache policy to use, or null if to use in-memory policy
 * @param callback
 */
module.exports = function(server, sessionConfig, cache, callback) {

    const internals = {};
    const app = server.app;

    const cookieAuthPlugin = {};
    sessionConfig = sessionConfig || app.config.sessionAuth;


    // If no cache provider was given, then use the default hapi cache policy
    /* istanbul ignore else: it's not our problem to test a custom cache provider */
    if (!cache) {
        cache = server.hapi.cache({
            segment: 'sessions',
            expiresIn: TWO_WEEKS
        });
    }


    cookieAuthPlugin.register = function (plugin, options, next) {
        plugin.auth.scheme('session_cookie', internals.implementation);
        next();
    };


    cookieAuthPlugin.register.attributes = {
        pkg: require('./package.json')
    };


    internals.generateSessionId = function(prefix) {
        return baseId.base62.generateToken(Math.round(Math.random() * 10) + 40, prefix || "sid_");
    };


    internals.implementation = function(server, options) {

        // noinspection JSValidateJSDoc
        /**
         * Default cookie options
         * @type {{ttl: number, encoding: string}}
         */
        const defaultOptions = {
                ttl: TWO_WEEKS,
                encoding: 'none',
                path: '/' // <-- without this, you might end up with setting cookies on each page of the site. DERP DERP
            },

            /**
             * Default sessionAuth configuration
             * @type {{cookie: {name: string, options: {ttl: number, encoding: string}}, redirectTo: string, appendNext: boolean, redirectOnTry: boolean, validationFunc: defaultCookieConfig.validateFunc}}
             */
            defaultCookieConfig = {
                cookie: {
                    name: 'ok_idksid',
                    options: defaultOptions
                },
                redirectTo: '/login', // redirect to /login if not authed
                appendNext: true, // append the origin url
                redirectOnTry: true, // if no active session, redirect

                /**
                 * Optional validation function to allow app to check session content for validity
                 * @param request
                 * @param sessionData
                 * @param {function(err:Error|null, isValid:boolean, [res]:Boom)} callback
                 */
                validateFunc: null
            },

            /**
             * Session Plugin Config
             * @type {{cookie: {name: string, options: {ttl: number, encoding: string}}, redirectTo: string, appendNext: boolean, redirectOnTry: boolean, validationFunc: defaultCookieConfig.validateFunc}}
             */
            config = options || defaultCookieConfig,

            /**
             * Cookie name we're going with
             * @type {string}
             */
            name = config.cookie.name || 'ok_idksid';


        // Register the SID cookie
        server.state(name, config.cookie.options || defaultOptions);


        // Add session interface to requests
        server.ext('onPreAuth', function(request, reply) {

            // Stick the session
            request.session = {

                sid: null,

                data: { },

                loaded: false,

                start: (context, callback) => {
                    const sid = internals.generateSessionId();
                    cache.set(sid, context, 0, function(err) {
                        /* istanbul ignore if: it's not our problem to test a custom cache provider */
                        if (err) {
                            app.report('Failed to start session', sid, err);
                            callback(err);
                        } else {
                            // Set the sid cookie
                            request.session.sid = sid;
                            reply.state(name, sid);
                            callback();
                        }
                    });
                },

                destroy: (callback) => {

                    // What's our sid again?
                    const sid = request.session.sid;

                    // Purge the session from existence
                    reply.unstate(name);

                    // Only drop the sid if the sid is real
                    if (sid) {
                        cache.drop(sid, (err) => {
                            /* istanbul ignore if: it's not our problem to test a custom cache provider */
                            if (err) {
                                app.report('Failed to destroy session from cache', sid, err);
                            }
                            request.session.sid = null;
                            request.session.loaded = false;
                            request.session.data = null;
                            callback(err);
                        });
                    } else {
                        app.log('Warning: Could not drop session because no session id was present!');
                        callback();
                    }
                }
            };

            return reply.continue();

        });


        // Add an automatic extension to session cookies on every request
        server.ext('onPreResponse', function(request, reply) {

            // TODO - save the session state changes only if dirty
            if (request.session && request.session.loaded) {
                cache.set(request.session.sid, request.session.data, 0, function (err) {
                    /* istanbul ignore if: it's not our problem to test a custom cache provider */
                    if (err) {
                        app.report('Failed to automatically update session on response end', err);
                    }
                    return reply.continue();
                });
            } else {
                return reply.continue();
            }

        });

        //noinspection UnnecessaryLocalVariableJS,JSUnusedGlobalSymbols
        const scheme = {
            authenticate: function(request, reply) {

                const validate = function() {

                    // Pull the cookie sid
                    const sid = request.state[name];
                    if (!sid) {
                        return unauthenticated(app.response.unauthorized(null, 'session_cookie'));
                    }

                    // FIXME: sid CAN BE AN ARRAY, if the cookie is sent up multiple times by the client, so this throws
                    // Needs testing of each cookie and the response should tell the client to delete the shitty cookies

                    // Try to retrieve the session state
                    cache.get(sid, function(err, cachedSession) {

                        // - On failure, return badImplementation
                        /* istanbul ignore if: it's not our problem to test a custom cache provider */
                        if (err) {
                            app.report('Failed to retrieve session from cache', sid, err);
                            return reply(app.response.badImplementation(null, err));
                        }

                        // - If not found, pass to unauthenticated
                        if (!cachedSession) {
                            // Purge the shitty sid outta here
                            reply.unstate(name);
                            return unauthenticated(app.response.unauthorized('Invalid session cookie', 'session_cookie'));
                        } else {

                            const success = function() {
                                // Do a keep alive, and return valid
                                reply.state(name, sid);

                                request.session.sid = sid;
                                request.session.data = cachedSession;
                                request.session.loaded = true;

                                return reply.continue({ credentials: cachedSession, artifacts: sid });
                            };

                            // Allow hooks into the authorization, to allow the app to check the contents of the session for validity
                            if (config.validateFunc) {
                                // e.g - check if the session_token has expired
                                //       - If not, purge the sid and return unauthenticated
                                config.validateFunc(request, cachedSession, function(err, isValid, res) {
                                    if (err || !isValid) {
                                        reply.unstate(name);
                                        return unauthenticated(res || app.response.unauthorized('Invalid session state', 'session_cookie'));
                                    } else {
                                        success();
                                    }
                                });
                            } else {
                                return success();
                            }


                        }
                    });


                };


                const unauthenticated = function(err, result) {

                    if (config.redirectOnTry === false &&
                        request.auth.mode === 'try') {

                        return reply(err, null, result);
                    }

                    let redirectTo = config.redirectTo;
                    if (request.route.settings.plugins['okanjo-session-cookie'] &&
                        request.route.settings.plugins['okanjo-session-cookie'].redirectTo !== undefined) {

                        redirectTo = request.route.settings.plugins['okanjo-session-cookie'].redirectTo;
                    }

                    if (!redirectTo) {
                        return reply(err, null, result);
                    }

                    let uri = redirectTo;
                    if (config.appendNext) {
                        if (uri.indexOf('?') !== -1) {
                            uri += '&';
                        }
                        else {
                            uri += '?';
                        }

                        uri += 'next=' + encodeURIComponent(request.url.path);
                    }

                    return reply('You are being redirected...', null, result).redirect(uri);
                };


                validate();
            }
        };

        return scheme;
    };


    // Register the plugin on the live server
    server.hapi.register(cookieAuthPlugin, function(err) {
        /* istanbul ignore if: we don't expect hapi to fail registration */
        if (err) {
            app.report('Failed to register Okanjo cookie auth plugin', err);
        } else {
            // Register the auth strategy too
            server.hapi.auth.strategy('session', 'session_cookie', sessionConfig);
        }

        callback(err);
    });

};