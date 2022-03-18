"use strict";

const OkanjoApp = require('okanjo-app');
const OkanjoWebServer = require('okanjo-app-server');
const OkanjoServerSessionPlugin = require('../SessionPlugin');
const Joi = require('joi');
const Needle = require('needle');
const should = require('should');
const Boom = require('@hapi/boom');
const Util = require('util');

describe('Session Module', function() {

    function bindRoutes(server, credentials=null) {
        server.hapi.route({
            method: 'GET',
            path: '/',
            handler: (/*request, h*/) => {

                //noinspection HtmlUnknownTarget
                return 'YOU ARE AUTHENTICATE. <a href="/logout">logout</a>?';

            },
            config: {
                auth: 'session'
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/orgs',
            handler: (/*request, h*/) => {

                //noinspection HtmlUnknownTarget
                return 'THIS IS ORGANIZATION. <a href="/">home</a> or <a href="/logout">logout</a>?';

            },
            config: {
                auth: 'session'
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/data',
            handler: (request/*, h*/) => {

                return request.session.data;

            },
            config: {
                auth: 'session'
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/modify',
            handler: (request, h) => {

                request.session.data.things = Math.random();

                h.redirect('/data');

            },
            config: {
                auth: 'session'
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/login',
            handler: (request, h) => {

                // If authenticated, go home
                if (request.auth.isAuthenticated) {
                    if (request.query.next) {
                        return h.redirect(request.query.next);
                    } else {
                        return h.redirect('/');
                    }
                }

                //noinspection HtmlUnknownTarget
                return `YOU ARE LOGOUT. Go <a href="/">home</a> or <a href="/login/start?${request.query.next ? 'next=' + encodeURIComponent(request.query.next) : ''}">authenticate?</a>`;
            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                validate: {
                    query: Joi.object({
                        next: Joi.string().optional()
                    })
                }
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/login/start',
            handler: async (request, h) => {

                if (request.auth.isAuthenticated) {
                    if (request.query.next) {
                        return h.redirect(request.query.next);
                    } else {
                        return h.redirect('/');
                    }
                } else {

                    // This is the example res.data from an SDK login request
                    const exampleSessionRes = credentials || {
                        account: {
                            id: "ac_whatever",
                            email: "whatever@whatever.whatever"
                        },
                        session: {
                            id: "ses_whatever",
                            expiry: "2020-01-01T00:00:00-06:00"
                        }
                    };

                    await request.session.start(exampleSessionRes);

                    if (request.query.next) {
                        return h.redirect(request.query.next);
                    } else {
                        return h.redirect('/');
                    }
                }

            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                validate: {
                    query: Joi.object({
                        next: Joi.string().optional()
                    })
                }
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/logout',
            handler: async (request, h) => {

                await request.session.destroy();
                return h.redirect('/login');

            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } }
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/mfa',
            handler: (/*request, h*/) => {

                //noinspection HtmlUnknownTarget
                return 'YOU ARE MFA AUTHENTICATE. <a href="/logout">logout</a>?';

            },
            config: {
                auth: 'session',
                plugins: { 'okanjo-session-cookie': { requireMFA: true } }
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/mfa/set',
            handler: (request/*, h*/) => {

                request.session.data.mfaAuthenticated = true;

                //noinspection HtmlUnknownTarget
                return 'YOU ARE MFA AUTHENTICATE. <a href="/logout">logout</a>?';

            },
            config: {
                auth: 'session'
            }
        });
    }

    async function startServer(app) {
        // Create the web server instance
        const server = new OkanjoWebServer(app, app.config.webServer);

        await server.start();

        console.error('Server running on ', server.hapi.info.uri); // eslint-disable-line no-console
        return server;
    }

    async function killServer(server) {
        await server.stop();
    }

    describe('Default usage', function() {

        let server;
        const app = new OkanjoApp({
            webServer: {
            }
        });
        const cookieName = 'sid';
        let routeBase;

        before(async () => {
            server = new OkanjoWebServer(app, app.config.webServer);
            await server.init();
        });

        after(async () => {
            await killServer(server);
        });

        it('should register as a promise too', async () => {
            // Register the plugin with default configuration
            const server = new OkanjoWebServer(app, {});
            await server.init();
            await OkanjoServerSessionPlugin.register(server, null, null);
        });

        it('should register', async () => {
            // Register the plugin (these options emulate the old v1 policy defaults)
            const options = {
                isSecure: false,
                redirectTo: '/login',
                appendNext: true,
                keepAlive: true
            };
            // noinspection JSIgnoredPromiseFromCall
            await OkanjoServerSessionPlugin.register(server, options, null);

            bindRoutes(server);

            await server.start().then(() => {
                routeBase = 'http://localhost:' + server.hapi.info.port;
            });
        });

        it('should redirect from secure page to login with no sid cookie', done => {
            Needle.get(`${routeBase}/orgs`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login?next=%2Forgs');

                done();
            });
        });

        it('should redirect from secure page to login with invalid sid cookie', done => {

            const cookies = {};
            cookies[cookieName] = 'bogus';

            Needle.get(`${routeBase}/orgs`, { cookies: cookies }, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login?next=%2Forgs');

                // Make sure the server told us to wipe our smug cookie off the face of the earth
                res.headers['set-cookie'][0].should.match(/Max-Age=0/);

                // The cookie value should be empty
                //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
                should(res.cookies[cookieName]).be.a.exactly(undefined);

                // Try redirecting to a url with a query string already present
                Needle.get(`${routeBase}/orgs?whatever=present`, { cookies: cookies }, (err, res) => {
                    should(err).not.be.ok();
                    res.should.be.an.Object();

                    //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                    res.statusCode.should.equal(302);
                    res.headers.location.should.equal('/login?next=%2Forgs%3Fwhatever%3Dpresent');

                    done();
                });
            });
        });

        it('should start, access resources, and logout successfully', function(done) {
            this.timeout(5000);

            Needle.get(`${routeBase}/login/start`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                const loginCookies = res.cookies,
                      cookieHeader = res.headers['set-cookie'][0];

                setTimeout(() => { // We have to pause 1 second to check that our expiration times are different
                    Needle.get(`${routeBase}/orgs`, { cookies: loginCookies }, (err, res) => {
                        should(err).not.be.ok();
                        res.should.be.an.Object();

                        //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                        res.statusCode.should.equal(200);

                        res.body.should.match(/THIS IS ORGANIZATION/);

                        res.cookies.should.deepEqual(loginCookies); // The sids should match
                        cookieHeader.should.not.equal(res.headers['set-cookie'][0]);

                        Needle.get(`${routeBase}/logout`, { cookies: loginCookies }, (err, res) => {
                            should(err).not.be.ok();
                            res.should.be.an.Object();

                            //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                            res.statusCode.should.equal(302);
                            res.headers.location.should.equal('/login');

                            // Make sure the server told us to kill our cookie
                            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

                            // The cookie value should be empty
                            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
                            should(res.cookies[cookieName]).be.exactly(undefined);

                            done();
                        });
                    });
                }, 1000);

            });
        });

        it('should warn when trying to kill a non-existant session', done => {
            Needle.get(`${routeBase}/logout`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login');

                // Make sure the server told us to kill our cookie
                res.headers['set-cookie'][0].should.match(/Max-Age=0/);

                // The cookie value should be empty
                //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // Needle 0.x
                should(res.cookies[cookieName]).be.exactly(undefined); // Needle 0.x


                done();
            });
        });

    });

    describe('Basic usage', () => {

        let server;
        const app = new OkanjoApp({
            webServer: {
                hapiServerOptions: {
                    port: 5555
                }
            },
            sessionAuth: {
                isSecure: false,
                redirectTo: '/login?param=present',
                appendNext: true,
                keepAlive: true,

                cookie: undefined,// to test default idk edge case
            }
        });
        const routeBase = 'http://localhost:5555';

        before(async () => {
            server = await startServer(app);
        });

        after(async () => {
            await killServer(server);
        });

        it('should register', async () => {
            // Register the plugin with default configuration
            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, null);
        });

        it('should bind test routes', () => {
            bindRoutes(server);
        });

        it('should redirect from secure page to login with no sid cookie', done => {
            Needle.get(`${routeBase}/orgs`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login?param=present&next=%2Forgs');

                done();
            });
        });
    });

    describe('Without redirect magic', () => {

        let server;
        const app = new OkanjoApp({
            webServer: {
                hapiServerOptions: {port: 5555}
            },
            sessionAuth: {
                cookie: "ok_unittest_sid",
                appendNext: false,
                isSecure: false,
                keepAlive: true
            }
        });
        const cookieName = 'ok_unittest_sid';
        const routeBase = 'http://localhost:5555';

        before(async () => {
            server = await startServer(app);
        });

        after(async () => {
            await killServer(server);
        });

        it('should register', async () => {
            // Register the plugin with default configuration
            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, null);
        });

        it('should bind test routes', () => {
            bindRoutes(server);
        });

        it('should not redirect', done => {
            Needle.get(`${routeBase}/orgs`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.body)

                res.statusCode.should.equal(401);
                should(res.headers.location).not.be.ok();

                res.body.message.should.match('Missing authentication');

                done();
            });
        });

        it('should login with custom cookie name', done => {
            Needle.get(`${routeBase}/login/start`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                done();
            });
        });
    });

    describe('With redirect but no param', () => {

        let server;
        const app = new OkanjoApp({
            webServer: {
                hapiServerOptions: {port: 5555}
            },
            sessionAuth: {
                cookie: "ok_unittest_sid", // to test default idk edge case
                redirectTo: '/login',
                appendNext: false,
                isSecure: false,
                keepAlive: true
            }
        });
        const cookieName = 'ok_unittest_sid';
        const routeBase = 'http://localhost:5555';

        before(async () => {
            server = await startServer(app);
        });

        after(async () => {
            await killServer(server);
        });

        it('should register', async () => {
            // Register the plugin with default configuration
            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, null);
        });

        it('should bind test routes', () => {
            bindRoutes(server);
        });

        it('should redirect', done => {
            Needle.get(`${routeBase}/orgs`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login');

                done();
            });
        });

        it('should login with custom cookie name', done => {
            Needle.get(`${routeBase}/login/start`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                done();
            });
        });
    });

    describe('With validation hooks', () => {

        let server;
        let passSessionValidation = true;
        let customErrorMessage = true;
        let explode = false;

        const app = new OkanjoApp({
            webServer: {
                hapiServerOptions: {port: 5555}
            },
            sessionAuth: {
                cookie: "ok_unittest_sid", // to test default idk edge case
                appendNext: false,
                keepAlive: true,
                validateFunc: async (/*request, session*/) => {
                    if (passSessionValidation) {
                        return { valid: true };
                    } else {
                        // Pretend that the session token expired
                        if (explode) {
                            throw Boom.badImplementation('Something went wrong!');
                        }

                        return { valid: false, error: customErrorMessage ? Boom.unauthorized('Session token expired', 'session_cookie') : null };
                    }
                }
            }
        });
        const cookieName = 'ok_unittest_sid';
        const routeBase = 'http://localhost:5555';


        before(async () => {
            server = await startServer(app);
        });

        after(async () => {
            await killServer(server);
        });

        it('should register', async () => {
            // Register the plugin with default configuration
            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, null);
        });

        it('should bind test routes', () => {
            bindRoutes(server);
        });

        it('should handle validation and most edge cases', done => {
            Needle.get(`${routeBase}/login/start`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                // Access a resource, should be granted
                Needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, (err, res) => {
                    should(err).not.be.ok();
                    res.should.be.an.Object();

                    //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                    res.statusCode.should.equal(200);
                    res.body.should.match(/THIS IS ORGANIZATION/);

                    res.cookies[cookieName].should.be.a.String().and.not.empty();

                    // Now accessing a resource should tell us our session expired
                    passSessionValidation = false;
                    Needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, (err, res) => {
                        should(err).not.be.ok();
                        res.should.be.an.Object();

                        //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                        res.statusCode.should.equal(401);
                        res.body.message.should.match(/Session token expired/);

                        done();
                    });
                });
            });
        });

        it('should use default error message on validation error', done => {
            Needle.get(`${routeBase}/login/start`, (err, res) => {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                // Now accessing a resource should tell us our session expired
                explode = true;
                Needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, (err, res) => {
                    should(err).not.be.ok();
                    res.should.be.an.Object();

                    //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                    res.statusCode.should.equal(401);
                    res.body.message.should.match(/Invalid session state/);

                    done();
                });
            });
        });
    });

    // (^) old tests, new tests (v)

    describe('SessionPlugin', () => {

        it('can handle config errors in promise mode', async () => {
            const app = new OkanjoApp({});
            const server = new OkanjoWebServer(app, {});
            await server.init();
            try {
                await OkanjoServerSessionPlugin.register(server, {bogus: true}, null);
            } catch(err) {
                should(err).be.ok();
                err.name.should.match(/ValidationError/);
            }
        });

        it('needs no configuration whatsoever', async () => {
            const app = new OkanjoApp({});
            const server = new OkanjoWebServer(app, {});
            await server.init();
            try {
                await OkanjoServerSessionPlugin.register(server);
            } catch(err) {
                should(err).be.ok();
                err.name.should.match(/ValidationError/);
            }
        });

    });

    describe('SessionCookePlugin', () => {

        const testLoginLogout = async (server, cookieName = 'sid', cookieSid = null) => {
            const routeBase = 'http://localhost:' + server.hapi.info.port;

            let res = await Needle('get', `${routeBase}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies[cookieName].should.be.a.String().and.not.empty();

            const loginCookies = res.cookies;

            if (cookieSid) {
                loginCookies[cookieName].should.be.exactly(cookieSid);
            }

            res = await Needle('get', `${routeBase}/orgs`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/THIS IS ORGANIZATION/);
            res.cookies.should.deepEqual(loginCookies); // The sids should match

            res = await Needle('get', `${routeBase}/logout`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            // Make sure the server told us to kill our cookie
            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

            // The cookie value should be empty
            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
            should(res.cookies[cookieName]).be.exactly(undefined);

        };

        it('can be registered without the helper', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: true,
                    keepAlive: true
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await server.hapi.register({
                plugin: OkanjoServerSessionPlugin.SessionCookiePlugin,
                options: app.config.sessionAuth
            });
            bindRoutes(server);

            server.hapi.route({
                method: 'GET',
                path: '/edge-cases',
                handler: async (request/*, h*/) => {

                    request.session.settings.report('This can report, but it is a no-op');

                    return 'ok'
                },
                config: {
                    auth: 'session'
                }
            });

            await server.start();

            await testLoginLogout(server);

            // Login
            let res = await Needle('get', `http://localhost:${server.hapi.info.port}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies['sid'].should.be.a.String().and.not.empty();

            const cookies = res.cookies;

            // Test edge cases
            res = await Needle('get', `http://localhost:${server.hapi.info.port}/edge-cases`, { cookies });
            should(res).be.ok();
            res.statusCode.should.be.exactly(200);
            res.body.should.be.exactly('ok');

            // Logout
            res = await Needle('get', `http://localhost:${server.hapi.info.port}/logout`, { cookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            await server.stop();

        });

        it('should accept an external cache', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: true,
                    keepAlive: true
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await server.hapi.cache.provision({ provider: require('@hapi/catbox-memory'), name: 'custom_session_cache' });
            const cache = server.hapi.cache({
                cache: 'custom_session_cache',
                segment: 'sessions',
                expiresIn: 3600
            });

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, cache);
            bindRoutes(server);

            await server.start();
            await testLoginLogout(server);
            await server.stop();
        });

        it('start/destroy/save can work with callbacks', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: true,
                    keepAlive: true
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await server.hapi.cache.provision({ provider: require('@hapi/catbox-memory'), name: 'custom_session_cache' });
            const cache = server.hapi.cache({
                cache: 'custom_session_cache',
                segment: 'sessions',
                expiresIn: 3600
            });

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, cache);

            server.hapi.route({
                method: 'GET',
                path: '/orgs',
                handler: async (request/*, h*/) => {

                    const save = Util.promisify(request.session.save.bind(request.session));
                    await save();

                    //noinspection HtmlUnknownTarget
                    return 'THIS IS ORGANIZATION. <a href="/">home</a> or <a href="/logout">logout</a>?';

                },
                config: {
                    auth: 'session'
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/login/start',
                handler: async (request, h) => {

                    if (request.auth.isAuthenticated) {
                        if (request.query.next) {
                            return h.redirect(request.query.next);
                        } else {
                            return h.redirect('/');
                        }
                    } else {

                        // This is the example res.data from an SDK login request
                        const exampleSessionRes = {
                            account: {
                                id: "ac_whatever",
                                email: "whatever@whatever.whatever"
                            },
                            session: {
                                id: "ses_whatever",
                                expiry: "2020-01-01T00:00:00-06:00"
                            }
                        };

                        const start = Util.promisify(request.session.start.bind(request.session));
                        await start(exampleSessionRes);

                        if (request.query.next) {
                            return h.redirect(request.query.next);
                        } else {
                            return h.redirect('/');
                        }
                    }

                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                    validate: {
                        query: Joi.object({
                            next: Joi.string().optional()
                        })
                    }
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/logout',
                handler: async (request, h) => {

                    const destroy = Util.promisify(request.session.destroy.bind(request.session));
                    await destroy();
                    return h.redirect('/login');

                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } }
                }
            });

            await server.start();
            await testLoginLogout(server);
            await server.stop();
        });

        it('start w/ id/destroy/save can work with callbacks', async () => {
            const sid = 'SESSION_SID';
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: true,
                    keepAlive: true
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await server.hapi.cache.provision({ provider: require('@hapi/catbox-memory'), name: 'custom_session_cache' });
            const cache = server.hapi.cache({
                cache: 'custom_session_cache',
                segment: 'sessions',
                expiresIn: 3600
            });

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth, cache);

            server.hapi.route({
                method: 'GET',
                path: '/orgs',
                handler: async (request/*, h*/) => {

                    const save = Util.promisify(request.session.save.bind(request.session));
                    await save();

                    //noinspection HtmlUnknownTarget
                    return 'THIS IS ORGANIZATION. <a href="/">home</a> or <a href="/logout">logout</a>?';

                },
                config: {
                    auth: 'session'
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/login/start',
                handler: async (request, h) => {

                    if (request.auth.isAuthenticated) {
                        if (request.query.next) {
                            return h.redirect(request.query.next);
                        } else {
                            return h.redirect('/');
                        }
                    } else {

                        // This is the example res.data from an SDK login request
                        const exampleSessionRes = {
                            account: {
                                id: "ac_whatever",
                                email: "whatever@whatever.whatever"
                            },
                            session: {
                                id: "ses_whatever",
                                expiry: "2020-01-01T00:00:00-06:00"
                            }
                        };

                        const start = Util.promisify(request.session.startWithId.bind(request.session));
                        await start(sid, exampleSessionRes);

                        request.session.sid.should.be.exactly(sid);

                        if (request.query.next) {
                            return h.redirect(request.query.next);
                        } else {
                            return h.redirect('/');
                        }
                    }

                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                    validate: {
                        query: Joi.object({
                            next: Joi.string().optional()
                        })
                    }
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/logout',
                handler: async (request, h) => {

                    const destroy = Util.promisify(request.session.destroy.bind(request.session));
                    await destroy();
                    return h.redirect('/login');

                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } }
                }
            });

            await server.start();
            await testLoginLogout(server);
            await server.stop();
        });

        it('handle Session class edge cases', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: true,
                    keepAlive: true
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth);

            server.hapi.route({
                method: 'GET',
                path: '/orgs',
                handler: async (request/*, h*/) => {

                    // Load when already loaded does nothing
                    await request.session.load();

                    // Save when not loaded does nothing
                    request.session.loaded = false;
                    await request.session.save();

                    // Callback version too
                    const save = Util.promisify(request.session.save.bind(request.session));
                    await save();

                    request.session.loaded = true;


                    //noinspection HtmlUnknownTarget
                    return 'THIS IS ORGANIZATION. <a href="/">home</a> or <a href="/logout">logout</a>?';
                },
                config: {
                    auth: 'session'
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/login/start',
                handler: async (request, h) => {

                    // This is the example res.data from an SDK login request
                    const exampleSessionRes = {
                        account: {
                            id: "ac_whatever",
                            email: "whatever@whatever.whatever"
                        },
                        session: {
                            id: "ses_whatever",
                            expiry: "2020-01-01T00:00:00-06:00"
                        }
                    };

                    await request.session.start(exampleSessionRes);

                    if (request.query.next) {
                        return h.redirect(request.query.next);
                    } else {
                        return h.redirect('/');
                    }
                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                    validate: {
                        query: Joi.object({
                            next: Joi.string().optional()
                        })
                    }
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/logout',
                handler: async (request, h) => {
                    await request.session.destroy();
                    return h.redirect('/login');
                },
                config: {
                    auth: { mode: 'try', strategies: ['session'] },
                    plugins: { 'okanjo-session-cookie': { redirectTo: false } }
                }
            });

            await server.start();
            await testLoginLogout(server);
            await server.stop();
        });

        it('should accept cookie options', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: { name: 'goto' },
                    keepAlive: true,
                    ttl: 3600,
                    domain: 'localhost',
                    ignoreIfDecorated: true
                }
            });

            const server = new OkanjoWebServer(app, {});
            await server.init();

            server.hapi.decorate('request', 'session', (/*req*/) => 'hikacked', { apply: true });

            await server.hapi.register({
                plugin: OkanjoServerSessionPlugin.SessionCookiePlugin,
                options: app.config.sessionAuth
            });
        });

        it('should accept cookie options (raw, ttl)', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: '/login',
                    appendNext: { raw: true },
                    keepAlive: true,
                    domain: 'localhost',
                    ignoreIfDecorated: true,
                    ttl: null
                }
            });

            const server = new OkanjoWebServer(app, {});
            await server.init();

            server.hapi.decorate('request', 'session', (/*req*/) => 'hikacked', { apply: true });

            await server.hapi.register({
                plugin: OkanjoServerSessionPlugin.SessionCookiePlugin,
                options: app.config.sessionAuth
            });
        });

        it('should handle more edge cases', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    appendNext: { raw: true },
                    keepAlive: false,
                    clearInvalid: true,
                    redirectTo: () => '/login'
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth);
            bindRoutes(server);

            server.hapi.route({
                method: 'GET',
                path: '/edges',
                handler: (request/*, h*/) => {

                    // how you like me now?
                    delete request.session;

                    //noinspection HtmlUnknownTarget
                    return 'ok';

                },
                config: {
                    auth: 'session'
                }
            });

            await server.start();

            const routeBase = 'http://localhost:' + server.hapi.info.port;
            const cookieName = 'sid';

            let res = await Needle('get', `${routeBase}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies[cookieName].should.be.a.String().and.not.empty();

            const loginCookies = res.cookies;

            res = await Needle('get', `${routeBase}/orgs`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/THIS IS ORGANIZATION/);
            // res.cookies.should.deepEqual(loginCookies); // keep alive is off

            res = await Needle('get', `${routeBase}/edges`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/ok/);

            res = await Needle('get', `${routeBase}/logout`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            // Make sure the server told us to kill our cookie
            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

            // The cookie value should be empty
            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
            should(res.cookies[cookieName]).be.exactly(undefined);

            await server.stop();
        });

        it('should handle auth edge cases', async () => {
            let mode = 0;
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    appendNext: { raw: true },
                    keepAlive: false,
                    clearInvalid: true,
                    redirectTo: () => '/login',
                    validateFunc: (/*request, sessionState*/) => {
                        if (mode === 0) {
                            return {valid: true};
                        } else {
                            return {valid: false};
                        }
                    }
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth);
            bindRoutes(server);

            await server.start();

            const routeBase = 'http://localhost:' + server.hapi.info.port;
            const cookieName = 'sid';

            let res = await Needle('get', `${routeBase}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies[cookieName].should.be.a.String().and.not.empty();

            const loginCookies = res.cookies;

            res = await Needle('get', `${routeBase}/orgs`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/THIS IS ORGANIZATION/);
            // res.cookies.should.deepEqual(loginCookies); // keep alive is off

            // suddenly fail validation
            mode = 1;

            res = await Needle('get', `${routeBase}/orgs`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.be.exactly('/login?next=%2Forgs');

            mode = 0;

            res = await Needle('get', `${routeBase}/logout`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            // Make sure the server told us to kill our cookie
            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

            // The cookie value should be empty
            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
            should(res.cookies[cookieName]).be.exactly(undefined);

            await server.stop();
        });

        it('should handle mfa use cases', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: false,
                    appendNext: true,
                    keepAlive: true,
                    validateFunc: (request, sessionState) => {
                        // console.log('validate request!', { sessionState, settings: request.route.settings.plugins['okanjo-session-cookie'] })
                        const settings = request.route.settings.plugins['okanjo-session-cookie'];
                        if (settings && settings.requireMFA) {
                            if (sessionState.mfaAuthenticated) {
                                // MFA required and session is validated
                                return {
                                    valid: true,
                                    error: null
                                };
                            } else {
                                // MFA required and session not yet validated
                                return {
                                    valid: false,
                                    error: Boom.unauthorized('MFA validation required.', 'session_cookie')
                                }
                            }
                        } else {
                            // MFA not required
                            return {
                                valid: true,
                                error: null
                            }
                        }
                    }
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            // await server.hapi.cache.provision({ provider: require('catbox-memory'), name: 'custom_session_cache' });
            // const cache = server.hapi.cache({
            //     cache: 'custom_session_cache',
            //     segment: 'sessions',
            //     expiresIn: 3600
            // });

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth);
            bindRoutes(server);

            await server.start();

            const cookieName = 'sid', cookieSid = null;
            const routeBase = 'http://localhost:' + server.hapi.info.port;

            let res = await Needle('get', `${routeBase}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies[cookieName].should.be.a.String().and.not.empty();

            const loginCookies = res.cookies;

            // noinspection PointlessBooleanExpressionJS
            if (cookieSid) {
                loginCookies[cookieName].should.be.exactly(cookieSid);
            }

            // hitting the mfa route will be denied since we don't have the flag set
            res = await Needle('get', `${routeBase}/mfa`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(401);
            res.body.message.should.match(/MFA/);
            // console.log(res.body)

            // set the mfa flag on the session
            res = await Needle('get', `${routeBase}/mfa/set`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.cookies.should.deepEqual(loginCookies); // The sids should match

            // hitting the mfa route now that the flag is set will be successful
            res = await Needle('get', `${routeBase}/mfa`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/YOU ARE MFA AUTHENTICATE/);
            res.cookies.should.deepEqual(loginCookies); // The sids should match

            res = await Needle('get', `${routeBase}/logout`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            // Make sure the server told us to kill our cookie
            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

            // The cookie value should be empty
            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
            should(res.cookies[cookieName]).be.exactly(undefined);

            await server.stop();
        });

        it('can be registered multiple times with different strategies', async () => {
            const app = new OkanjoApp({
                webServer: {},
                sessionAuth: {
                    isSecure: false,
                    redirectTo: false,
                    appendNext: true,
                    keepAlive: true,
                }
            });
            const server = new OkanjoWebServer(app, {});
            await server.init();

            await OkanjoServerSessionPlugin.register(server, app.config.sessionAuth);

            // Duplicate use of the cookie but different strategy
            server.hapi.auth.strategy('session_flag', 'session_cookie', {
                ...app.config.sessionAuth,
                skipCookieState: true,
                validateFunc: (request, sessionState) => {

                    // console.log('VALIDATE:', sessionState)

                    // Check flag
                    if (sessionState.account.has_flag) {
                        // Present
                        return {
                            valid: true,
                            error: null
                        };
                    }

                    // Not present
                    return {
                        valid: false,
                        error: Boom.unauthorized('You do not have permission to perform this operation')
                    };
                }
            });

            bindRoutes(server, {
                account: {
                    id: "ac_whatever",
                    email: "whatever@whatever.whatever",
                    has_flag: true
                },
                session: {
                    id: "ses_whatever",
                    expiry: "2020-01-01T00:00:00-06:00"
                }
            });

            server.hapi.route({
                method: 'GET',
                path: '/has-flag',
                handler: (/*request, h*/) => {

                    //noinspection HtmlUnknownTarget
                    return 'YOU ARE AUTHENTICATE FLAG. <a href="/logout">logout</a>?';

                },
                config: {
                    auth: 'session_flag'
                }
            });

            server.hapi.route({
                method: 'POST',
                path: '/remove-flag',
                handler: (request/*, h*/) => {

                    //noinspection HtmlUnknownTarget
                    request.session.data.account.has_flag = false;

                    return 'OK';
                },
                config: {
                    auth: 'session_flag'
                }
            });

            await server.start();

            const cookieName = 'sid', cookieSid = null;
            const routeBase = 'http://localhost:' + server.hapi.info.port;

            let res = await Needle('get', `${routeBase}/login/start`);
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/');
            res.cookies[cookieName].should.be.a.String().and.not.empty();

            const loginCookies = res.cookies;

            // noinspection PointlessBooleanExpressionJS
            if (cookieSid) {
                loginCookies[cookieName].should.be.exactly(cookieSid);
            }

            res = await Needle('get', `${routeBase}/has-flag`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(200);
            res.body.should.match(/AUTHENTICATE FLAG/);
            // console.log(res.cookies, loginCookies);

            res = await Needle('post', `${routeBase}/remove-flag`, {}, { cookies: loginCookies });
            res.should.be.an.Object();
            // console.log(res.statusCode, res.body);
            res.statusCode.should.equal(200);
            res.body.should.match(/OK/);

            res = await Needle('get', `${routeBase}/has-flag`, { cookies: loginCookies });
            res.should.be.an.Object();
            // console.log(res.statusCode, res.body);
            res.statusCode.should.equal(401);
            res.body.message.should.match(/permission to perform/);

            res = await Needle('get', `${routeBase}/logout`, { cookies: loginCookies });
            res.should.be.an.Object();
            res.statusCode.should.equal(302);
            res.headers.location.should.equal('/login');

            // Make sure the server told us to kill our cookie
            res.headers['set-cookie'][0].should.match(/Max-Age=0/);

            // The cookie value should be empty
            //should(res.cookies[cookieName]).be.a.String().and.not.be.ok(); // needle 0.x
            should(res.cookies[cookieName]).be.exactly(undefined);

            await server.stop();
        });

    });

});