'use strict';

const Boom = require('@hapi/boom');
const Bounce = require('@hapi/bounce');
const Hoek = require('@hapi/hoek');
const Joi = require('joi');
const baseId = require('base-id');

const internals = {};

internals.TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days


module.exports = {
    pkg: require('./package.json'),
    requirements: {
        hapi: '>=17.7.0'
    },
    register: async (server, options) => {

        // Setup cache provider, if not given
        if (!options.cache) {
            // await server.cache.provision({ provider: require('catbox-memory'), name: 'sessions' });
            options.cache = server.cache({
                // cache: 'sessions',
                segment: 'sessions',
                expiresIn: options.ttl || internals.TWO_WEEKS
            });
        }

        server.auth.scheme('session_cookie', internals.implementation);
        server.auth.strategy('session', 'session_cookie', options);
    }
};


internals.schema = Joi.object({
    cookie: Joi.string().default('sid'), // was `cookie`
    ttl: Joi.number().integer().min(0).allow(null)/*.when('keepAlive', { is: true, then: Joi.required() })*/.default(internals.TWO_WEEKS),
    domain: Joi.string().allow(null),
    path: Joi.string().default('/'),
    clearInvalid: Joi.boolean().default(false),
    keepAlive: Joi.boolean().default(false),
    isSameSite: Joi.valid('Strict', 'Lax').allow(false).default('Strict'),
    isSecure: Joi.boolean().default(true),
    isHttpOnly: Joi.boolean().default(true),
    redirectTo: Joi.alternatives(Joi.string(), Joi.func()).allow(false),
    appendNext: Joi.alternatives(Joi.string(), Joi.boolean(), Joi.object({ raw: Joi.boolean(), name: Joi.string() })).default(false),
    validateFunc: Joi.func(),
    requestDecoratorName: Joi.string().default('session'),
    ignoreIfDecorated: Joi.boolean().default(true),
    skipCookieState: Joi.boolean().default(false),

    cache: Joi.object().allow(null).default(null),  // session state cache
    report: Joi.func().default(() => () => {}),           // error reporting interface
}).required();

internals.generateSessionId = (prefix) => baseId.base62.generateToken(Math.round(Math.random() * 10) + 40, prefix || "sid_");


internals.Session = class {

    constructor(request, settings) {

        this.h = null; // set at preauth
        // noinspection JSUnusedGlobalSymbols
        this.request = request;
        this.settings = settings;

        this.sid = null;
        this.data = {};
        this.loaded = false;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Starts a new session with the given session payload
     * @param context
     * @param callback
     * @returns {Promise<any>}
     */
    start(context, callback) {
        return this.startWithId(internals.generateSessionId(), context, callback);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Starts a new session using the given identifier and payload
     * @param sid
     * @param context
     * @param callback
     * @returns {Promise<any>}
     */
    startWithId(sid, context, callback) {
        return new Promise( (resolve, reject) => {
            this.sid = sid;
            this.data = context;
            this.loaded = true;

            this.save()
                .then(() => {
                    // Set the sid cookie
                    this.h.state(this.settings.cookie, this.sid);

                    if (callback) callback();
                    resolve();
                })
                .catch(/* istanbul ignore next */ err => {
                    this.settings.report('Failed to start session', err, { sid: this.sid });
                    if (callback) callback(err);
                    return reject(err);
                })
            ;

        });
    }

    /**
     * Ends the current session
     * @param callback
     * @returns {Promise<any>}
     */
    destroy(callback) {
        return new Promise( (resolve, reject) => {

            // Purge the session from existence
            this.h.unstate(this.settings.cookie);

            const done = () => {
                if (callback) callback();
                resolve();
            };

            // Only drop the sid if the sid is real
            if (this.sid) {
                this.settings.cache.drop(this.sid)
                    .then(() => {
                        this.sid = null;
                        this.loaded = false;
                        this.data = {};
                        done();
                    })
                    .catch(/* istanbul ignore next */ err => {
                        this.settings.report('Failed to remove session from cache', err, { sid: this.sid });
                        if (callback) callback(err);
                        return reject(err)
                    })
                ;

            } else {
                done();
            }
        });
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Loads the session from cache
     * @returns {Promise<void>}
     */
    async load() {
        if (!this.loaded) {
            try {
                this.data = await this.settings.cache.get(this.sid);
                this.loaded = true;
            } catch(err) /* istanbul ignore next */ {
                this.settings.report('Failed to load session from cache', err, { sid: this.sid });
                throw err;
            }
        }
    }

    /**
     * Save the session to the cache
     * @param callback
     * @returns {Promise<any>}
     */
    save(callback) {
        return new Promise((resolve, reject) => {

            const done = () => {
                if (callback) callback();
                return resolve();
            };

            if (this.loaded) {

                this.settings.cache.set(this.sid, this.data, 0)
                    .then(() => {
                        done();
                    })
                    .catch(/* istanbul ignore next */ err => {
                        this.settings.report('Failed to update session after response', err, { data: this.data });
                        if (callback) callback(err);
                        return reject(err);
                    })
                ;
            } else {
                done();
            }
        });
    }

};


internals.implementation = (server, options) => {

    const results = internals.schema.validate(options);
    Hoek.assert(!results.error, results.error);

    const settings = results.value;

    const cookieOptions = {
        encoding: 'none',
        isSecure: settings.isSecure,                  // Defaults to true
        path: settings.path,
        isSameSite: settings.isSameSite,
        isHttpOnly: settings.isHttpOnly,              // Defaults to true
        clearInvalid: settings.clearInvalid,
        ignoreErrors: true
    };

    if (settings.ttl) {
        cookieOptions.ttl = settings.ttl;
    }

    if (settings.domain) {
        cookieOptions.domain = settings.domain;
    }

    if (typeof settings.appendNext === 'boolean') {
        settings.appendNext = (settings.appendNext ? 'next' : '');
    }

    if (typeof settings.appendNext === 'object') {
        settings.appendNextRaw = settings.appendNext.raw;
        settings.appendNext = settings.appendNext.name || 'next';
    }

    // Setup the cookie, but skip if asked to do so (e.g. multiple session auth strategies that use the same cookie)
    if (!settings.skipCookieState) {
        server.state(settings.cookie, cookieOptions);
    }

    const decoration = (request) => {
        return new internals.Session(request, settings);
    };

    // Check if the request object should be decorated
    const isDecorated = server.decorations.request.indexOf(settings.requestDecoratorName) >= 0;

    if (!settings.ignoreIfDecorated || !isDecorated) {
        server.decorate('request', settings.requestDecoratorName, decoration, { apply: true });
    }

    server.ext('onPreAuth', (request, h) => {

        // Used for setting and unsetting state, not for replying to request
        request[settings.requestDecoratorName].h = h;

        return h.continue;
    });

    server.ext('onPreResponse', async (request, h) => {

        const session = request[settings.requestDecoratorName];
        if (session) {
            await session.save();
        }
        return h.continue;
    });

    // noinspection JSUnusedGlobalSymbols,UnnecessaryLocalVariableJS
    const scheme = {
        authenticate: async (request, h) => {

            const validate = async () => {

                // Check cookie

                const sid = request.state[settings.cookie];
                if (!sid) {
                    return unauthenticated(Boom.unauthorized(null, 'session_cookie'));
                }

                request[settings.requestDecoratorName].sid = sid;

                // Pull session state from cache
                try {
                    await request[settings.requestDecoratorName].load();
                } catch (err) /* istanbul ignore next */ {
                    settings.report('Failed to retrieve session from cache', err, { sid });
                    Bounce.rethrow(err, 'system');
                }

                const sessionState = request[settings.requestDecoratorName].data;

                // No state in cache, sid is no longer valid or spoofed
                if (!sessionState) {
                    h.unstate(settings.cookie);
                    return unauthenticated(Boom.unauthorized('Invalid session cookie', 'session_cookie'));
                }

                // Set session state to request decoration
                request[settings.requestDecoratorName].sid = sid;
                request[settings.requestDecoratorName].data = sessionState;
                request[settings.requestDecoratorName].loaded = true;

                if (!settings.validateFunc) {
                    if (settings.keepAlive) {
                        h.state(settings.cookie, sid);
                    }

                    return h.authenticated({ credentials: sessionState, artifacts: sid });
                }

                try {
                    const result = await settings.validateFunc(request, sessionState);

                    Hoek.assert(typeof result === 'object', 'Invalid return from validateFunc');
                    Hoek.assert(Object.prototype.hasOwnProperty.call(result, 'valid'), 'validateFunc must have valid property in return');

                    if (!result.valid) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw result.error || Boom.unauthorized(null, 'session_cookie');
                    }

                    if (settings.keepAlive) {
                        h.state(settings.cookie, sid);
                    }

                    return h.authenticated({ credentials: sessionState, artifacts: sid });
                }
                catch (err) {

                    Bounce.rethrow(err, 'system');

                    if (settings.clearInvalid) {
                        h.unstate(settings.cookie);
                    }

                    const unauthorized = Boom.isBoom(err) && err.typeof === Boom.unauthorized ? err : Boom.unauthorized('Invalid session state');
                    return unauthenticated(unauthorized, { credentials: sessionState, artifacts: sid });
                }
            };

            const unauthenticated = (err/*, result*/) => {

                let redirectTo = settings.redirectTo;
                if (request.route.settings.plugins['okanjo-session-cookie'] &&
                    request.route.settings.plugins['okanjo-session-cookie'].redirectTo !== undefined) {

                    redirectTo = request.route.settings.plugins['okanjo-session-cookie'].redirectTo;
                }

                let uri = (typeof (redirectTo) === 'function') ? redirectTo(request) : redirectTo;

                if (!uri || request.auth.mode !== 'required') {
                    return h.unauthenticated(err);
                }

                if (settings.appendNext) {
                    if (uri.indexOf('?') !== -1) {
                        uri += '&';
                    }
                    else {
                        uri += '?';
                    }

                    if (settings.appendNextRaw) {
                        uri += settings.appendNext + '=' + encodeURIComponent(request.raw.req.url);
                    }
                    else {
                        uri += settings.appendNext + '=' + encodeURIComponent((request.url.path || request.url.pathname) + request.url.search);
                    }
                }

                return h.response('You are being redirected...').takeover().redirect(uri);
            };

            return await validate();
        }
    };

    return scheme;
};
