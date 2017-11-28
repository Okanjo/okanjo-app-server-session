const OkanjoApp = require('okanjo-app'),
    OkanjoWebServer = require('okanjo-app-server'),
    OkanjoSessionAuthPlugin = require('../SessionPlugin'),
    Joi = require('joi'),
    needle = require('needle'),
    should = require('should');

describe('Session Module', function() {

    function startServer(app, done) {
        // Create the web server instance
        const server = new OkanjoWebServer(app, app.config.webServer, function (err) {
            should(err).be.exactly(null);
            server.start(function (err) {
                if (err) throw err;
                console.error('Server running on ', server.hapi.info.uri);
                done();
            });
        });
        return server;
    }

    function killServer(server, done) {
        server.stop(done);
    }

    // ----------------------------------------------------------------------------------------------------

    describe('Default usage', function() {

        let server;
        const app = new OkanjoApp({
                webServer: {
                    port: 5555
                }
            }),
            cookieName = 'ok_idksid',
            routeBase = 'http://localhost:' + app.config.webServer.port;

        before(function(done) {
            server = startServer(app, done);
        });


        after(function(done) {
            killServer(server, done);
        });


        it('should register', function(done) {
            // Register the plugin with default configuration
            OkanjoSessionAuthPlugin(server, null, null, done);
        });

        it('should bind test routes', function() {
            bindRoutes(server);
        });

        it('should redirect from secure page to login with no sid cookie', function(done) {
            needle.get(`${routeBase}/orgs`, function(err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login?next=%2Forgs');

                done();
            });
        });

        it('should redirect from secure page to login with invalid sid cookie', function(done) {

            const cookies = {};
            cookies[cookieName] = 'bogus';

            needle.get(`${routeBase}/orgs`, { cookies: cookies }, function(err, res) {
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
                needle.get(`${routeBase}/orgs?whatever=present`, { cookies: cookies }, function(err, res) {
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

            needle.get(`${routeBase}/login/start`, function(err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                const loginCookies = res.cookies,
                      cookieHeader = res.headers['set-cookie'][0];

                setTimeout(function() { // We have to pause 1 second to check that our expiration times are different
                    needle.get(`${routeBase}/orgs`, { cookies: loginCookies }, function(err, res) {
                        should(err).not.be.ok();
                        res.should.be.an.Object();

                        //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                        res.statusCode.should.equal(200);

                        res.body.should.match(/THIS IS ORGANIZATION/);

                        res.cookies.should.deepEqual(loginCookies); // The sids should match
                        cookieHeader.should.not.equal(res.headers['set-cookie'][0]);

                        needle.get(`${routeBase}/logout`, { cookies: loginCookies }, function(err, res) {
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


        it('should warn when trying to kill a non-existant session', function(done) {
            needle.get(`${routeBase}/logout`, function(err, res) {
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


        //it('should let me click around and screw with it', function(done) {
        //    this.timeout(60000 * 60) // 1 hr
        //    setTimeout(done, 60000 * 60);
        //});



    });


    // ----------------------------------------------------------------------------------------------------


    describe('Basic usage', function() {

        let server;
        const app = new OkanjoApp({
                webServer: {
                    port: 5555
                },
                sessionAuth: {
                    cookie: {
                        name: undefined // to test default idk edge case
                    },
                    options: undefined, // to test default edge case
                    redirectTo: '/login?param=present',
                    appendNext: true,
                    redirectOnTry: true
                }
            }),
            routeBase = 'http://localhost:' + app.config.webServer.port;


        before(function(done) {
            server = startServer(app, done);
        });


        after(function(done) {
            killServer(server, done);
        });


        it('should register', function (done) {
            // Register the plugin with default configuration
            OkanjoSessionAuthPlugin(server, app.config.sessionAuth, null, done);
        });

        it('should bind test routes', function () {
            bindRoutes(server);
        });

        it('should redirect from secure page to login with no sid cookie', function (done) {
            needle.get(`${routeBase}/orgs`, function (err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login?param=present&next=%2Forgs');

                done();
            });
        });
    });


    // ----------------------------------------------------------------------------------------------------


    describe('Without redirect magic', function() {

        let server;
        const app = new OkanjoApp({
                webServer: {
                    port: 5555
                },
                sessionAuth: {
                    cookie: {
                        name: "ok_unittest_sid" // to test default idk edge case
                    },
                    options: undefined, // to test default edge case
                    appendNext: false,
                    redirectOnTry: false
                }
            }),
            cookieName = 'ok_unittest_sid',
            routeBase = 'http://localhost:' + app.config.webServer.port;


        before(function(done) {
            server = startServer(app, done);
        });


        after(function(done) {
            killServer(server, done);
        });


        it('should register', function (done) {
            // Register the plugin with default configuration
            OkanjoSessionAuthPlugin(server, null, null, done);
        });

        it('should bind test routes', function () {
            bindRoutes(server);
        });

        it('should not redirect', function (done) {
            needle.get(`${routeBase}/orgs`, function (err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.body)

                res.statusCode.should.equal(401);
                should(res.headers.location).not.be.ok();

                res.body.message.should.match('Missing authentication');

                done();
            });
        });

        it('should login with custom cookie name', function(done) {
            needle.get(`${routeBase}/login/start`, function(err, res) {
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


    // ----------------------------------------------------------------------------------------------------


    describe('With redirect but no param', function() {

        let server;
        const app = new OkanjoApp({
                webServer: {
                    port: 5555
                },
                sessionAuth: {
                    cookie: {
                        name: "ok_unittest_sid" // to test default idk edge case
                    },
                    options: undefined, // to test default edge case
                    redirectTo: '/login',
                    appendNext: false,
                    redirectOnTry: true
                }
            }),
            cookieName = 'ok_unittest_sid',
            routeBase = 'http://localhost:' + app.config.webServer.port;


        before(function(done) {
            server = startServer(app, done);
        });


        after(function(done) {
            killServer(server, done);
        });


        it('should register', function (done) {
            // Register the plugin with default configuration
            OkanjoSessionAuthPlugin(server, null, null, done);
        });

        it('should bind test routes', function () {
            bindRoutes(server);
        });

        it('should redirect', function (done) {
            needle.get(`${routeBase}/orgs`, function(err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/login');

                done();
            });
        });

        it('should login with custom cookie name', function(done) {
            needle.get(`${routeBase}/login/start`, function(err, res) {
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


    // ----------------------------------------------------------------------------------------------------


    describe('With validation hooks', function() {

        let server,
            passSessionValidation = true,
            customErrorMessage = true;
        const app = new OkanjoApp({
                webServer: {
                    port: 5555
                },
                sessionAuth: {
                    cookie: {
                        name: "ok_unittest_sid" // to test default idk edge case
                    },
                    options: undefined, // to test default edge case
                    appendNext: false,
                    redirectOnTry: false,
                    validateFunc: function (request, session, callback) {
                        if (passSessionValidation) {
                            callback(null, true);
                        } else {
                            // Pretend that the session token expired
                            callback(null, false, customErrorMessage ? app.response.unauthorized('Session token expired', 'session_cookie') : null);
                        }
                    }
                }
            }),
            cookieName = 'ok_unittest_sid',
            routeBase = 'http://localhost:' + app.config.webServer.port;


        before(function(done) {
            server = startServer(app, done);
        });


        after(function(done) {
            killServer(server, done);
        });


        it('should register', function (done) {
            // Register the plugin with default configuration
            OkanjoSessionAuthPlugin(server, null, null, done);
        });

        it('should bind test routes', function () {
            bindRoutes(server);
        });

        it('should handle validation and most edge cases', function(done) {
            needle.get(`${routeBase}/login/start`, function(err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                // Access a resource, should be granted
                needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, function(err, res) {
                    should(err).not.be.ok();
                    res.should.be.an.Object();

                    //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                    res.statusCode.should.equal(200);
                    res.body.should.match(/THIS IS ORGANIZATION/);

                    // Now accessing a resource should tell us our session expired
                    passSessionValidation = false;
                    needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, function(err, res) {
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

        it('should use default error message on validation error', function(done) {
            needle.get(`${routeBase}/login/start`, function(err, res) {
                should(err).not.be.ok();
                res.should.be.an.Object();

                //console.log('RESPONSE', err, Object.keys(res), res.headers, res.statusCode, res.cookies)

                res.statusCode.should.equal(302);
                res.headers.location.should.equal('/');

                res.cookies[cookieName].should.be.a.String().and.not.empty();

                // Now accessing a resource should tell us our session expired
                customErrorMessage = false;
                needle.get(`${routeBase}/orgs`, { cookies: res.cookies }, function(err, res) {
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


    // ----------------------------------------------------------------------------------------------------



    function bindRoutes(server) {
        server.hapi.route({
            method: 'GET',
            path: '/',
            handler: function (request, reply) {

                //noinspection HtmlUnknownTarget
                reply('YOU ARE AUTHENTICATE. <a href="/logout">logout</a>?');

            },
            config: {
                auth: 'session'
            }
        });


        server.hapi.route({
            method: 'GET',
            path: '/orgs',
            handler: function (request, reply) {

                //noinspection HtmlUnknownTarget
                reply('THIS IS ORGANIZATION. <a href="/">home</a> or <a href="/logout">logout</a>?');

            },
            config: {
                auth: 'session'
            }
        });


        server.hapi.route({
            method: 'GET',
            path: '/data',
            handler: function (request, reply) {

                reply(request.session.data);

            },
            config: {
                auth: 'session'
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/modify',
            handler: function (request, reply) {

                request.session.data.things = Math.random();

                reply.redirect('/data');

            },
            config: {
                auth: 'session'
            }
        });


        server.hapi.route({
            method: 'GET',
            path: '/login',
            handler: function (request, reply) {

                // If authenticated, go home
                if (request.auth.isAuthenticated) {
                    if (request.query.next) {
                        return reply.redirect(request.query.next);
                    } else {
                        return reply.redirect('/');
                    }
                }

                //noinspection HtmlUnknownTarget
                reply(`YOU ARE LOGOUT. Go <a href="/">home</a> or <a href="/login/start?${request.query.next ? 'next=' + encodeURIComponent(request.query.next) : ''}">authenticate?</a>`);
            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                validate: {
                    query: {
                        next: Joi.string().optional()
                    }
                }
            }
        });


        server.hapi.route({
            method: 'GET',
            path: '/login/start',
            handler: function (request, reply) {

                if (request.auth.isAuthenticated) {
                    if (request.query.next) {
                        return reply.redirect(request.query.next);
                    } else {
                        return reply.redirect('/');
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

                    request.session.start(exampleSessionRes, function(err) {
                        if (err) {
                            console.error('FAILED TO SAVE SESSION TO CACHE!', err);
                            reply(app.response.badImplementation(err))
                        } else {
                            if (request.query.next) {
                                return reply.redirect(request.query.next);
                            } else {
                                return reply.redirect('/');
                            }
                        }
                    });
                }

            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } },
                validate: {
                    query: {
                        next: Joi.string().optional()
                    }
                }
            }
        });

        server.hapi.route({
            method: 'GET',
            path: '/logout',
            handler: function (request, reply) {

                request.session.destroy(function(err) {
                    should(err).not.be.ok();
                    reply.redirect('/login');
                });

            },
            config: {
                auth: { mode: 'try', strategies: ['session'] },
                plugins: { 'okanjo-session-cookie': { redirectTo: false } }
            }
        });
    }


});