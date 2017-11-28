# Okanjo Server Session Plugin  

[![Build Status](https://travis-ci.org/Okanjo/okanjo-app-server-session.svg?branch=master)](https://travis-ci.org/Okanjo/okanjo-app-server-session) [![Coverage Status](https://coveralls.io/repos/github/Okanjo/okanjo-app-server-session/badge.svg?branch=master)](https://coveralls.io/github/Okanjo/okanjo-app-server-session?branch=master)

Plugin to enable cross-server, persistent session state storage in Redis.

This plugin:
* uses a cookie for session id storage on clients
* registers a HAPI authentication strategy: `session`
* adds `request.session` for route handlers to use to access and modify sessions

## Installing

Add to your project like so: 

```sh
npm install okanjo-app-server-session
```

Note: requires 
* [`okanjo-app`](https://github.com/okanjo/okanjo-app) module.
* [`okanjo-app-server`](https://github.com/okanjo/okanjo-app-server) module.

## Example Usage

Here's an example app that demonstrates using several features of the module.

* `example-app`
  * `routes/`
    * `test_routes.js`
  * `config.js`
  * `index.js`

### `example-app/routes/test_routes.js`
This file binds the HAPI routes to the OkanjoServer.
```js
"use strict";

const Joi = require('joi');

module.exports = function() {
    const server = this;
    const app = server.app;

    // Home page, requires you to be logged in to view
    server.hapi.route({
        method: 'GET',
        path: '/',
        handler: (request, reply) => {

            //noinspection HtmlUnknownTarget
            reply('YOU ARE AUTHENTICATED. <a href="/data">view session contents</a> or <a href="/logout">logout</a>?');

        },
        config: {
            auth: 'session'
        }
    });


    // Shows the data stored in the session on the server side
    server.hapi.route({
        method: 'GET',
        path: '/data',
        handler: (request, reply) => {

            reply(`<code>${JSON.stringify(request.session.data, null, '  ')}</code> <a href="/modify">make modification</a> or <a href="/">go back home</a>`);

        },
        config: {
            auth: 'session'
        }
    });


    // Modifies a key in the session with a random value to show how it automatically updates
    server.hapi.route({
        method: 'GET',
        path: '/modify',
        handler: (request, reply) => {

            request.session.data.things = Math.random();

            reply.redirect('/data');

        },
        config: {
            auth: 'session'
        }
    });


    // Example login page, if already authenticated, will take you back to where you should go
    server.hapi.route({
        method: 'GET',
        path: '/login',
        handler: (request, reply) => {

            // If authenticated, go home
            if (request.auth.isAuthenticated) {
                if (request.query.next) {
                    return reply.redirect(request.query.next);
                } else {
                    return reply.redirect('/');
                }
            }

            //noinspection HtmlUnknownTarget
            reply(`YOU ARE NOT AUTHENTICATED. Go <a href="/">home</a> (hint, you'll bounce back here) or <a href="/login/start?${request.query.next ? 'next=' + encodeURIComponent(request.query.next) : ''}">authenticate?</a>`);
        },
        config: {
            auth: { mode: 'try', strategies: ['session'] },
            plugins: { 'okanjo-session-cookie': { redirectTo: false } }, // Override auto redirect
            validate: {
                query: {
                    next: Joi.string().optional()
                },
                options: {
                    allowUnknown: true,
                    stripUnknown: true
                }
            }
        }
    });


    // Performs the "authentication", where it is always successful
    // Ideally this would be a POST and would accept credentials to validate
    server.hapi.route({
        method: 'GET',
        path: '/login/start',
        handler: (request, reply) => {

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
                        expiry: "2030-01-01T00:00:00-06:00"
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
            plugins: { 'okanjo-session-cookie': { redirectTo: false } }, // Override auto redirect
            validate: {
                query: {
                    next: Joi.string().optional()
                }
            }
        }
    });


    // Example route to perform the logout (destroy the session)
    server.hapi.route({
        method: 'GET',
        path: '/logout',
        handler: (request, reply) => {

            request.session.destroy((err) => {
                if (err) {
                    app.report('Failed to destroy session', err, { session: request.session });
                }
                reply.redirect('/login');
            });

        },
        config: {
            auth: { mode: 'try', strategies: ['session'] },
            plugins: { 'okanjo-session-cookie': { redirectTo: false } } // Override auto redirect
        }
    });
};
```

### `example-app/config.js`
This is a basic configuration for the server and plugin
```js
"use strict";

const Path = require('path');
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days

module.exports = {
    webServer: {
        port: 5555,
        routePath: Path.join(__dirname, 'routes'),

        //// Uncomment this section if you want to store your session data in redis
        //// Useful for live environments
        // hapiServerOptions: {
        //     cache: [
        //         {
        //             name: 'myRedisCache',
        //             engine: require('catbox-redis'),
        //             host: '127.0.0.1',
        //             port: 6379,
        //             database: 0,
        //             partition: 'my-app-cache'
        //         }
        //     ]
        // }
    },
    sessionAuth: {
        cookie: {
            name: 'my_app_sid',
            options: {
                ttl: TWO_WEEKS,
                encoding: 'none',
                isSecure: false,
                path: '/'
            }
        },
        redirectTo: '/login?param=present',
        appendNext: true,
        redirectOnTry: true
    }
};
```

### `example-app/index.js`
This is the main app, which binds the plugin and starts the server.
```js
"use strict";

const OkanjoApp = require('okanjo-app');
const OkanjoServer = require('okanjo-app-server');
const SessionPlugin = require('okanjo-app-server-session');

const config = require('./config');
const app = new OkanjoApp(config);

app.connectToServices(() => {

    const options = {
        extensions: [
            function(next) {

                let cache = null;

                // Uncomment if you want to enable redis storage (also update config.js)
                // const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days
                // cache = this.hapi.cache({
                //     cache: 'myRedisCache',
                //     segment: 'mySessions',
                //     expiresIn: TWO_WEEKS
                // });

                SessionPlugin(this, app.config.serverAuth, cache, next);
            }
        ]
    };

    const server = new OkanjoServer(app, app.config.webServer, options, (err) => {
        if (err) throw err;

        server.start((err) => {
            if (err) throw err;
            console.log('Visit this URL in a browser: %s', server.hapi.info.uri);
        });

    });

});
```

A runnable version of this application can be found in [docs/example-app](https://github.com/okanjo/okanjo-app-server-session/tree/master/docs/example-app).


# `SessionPlugin(server, sessionConfig, cache, callback)`

The plugin exports a function which installs the plugin.

* `server` – The OkanjoServer instance to bind to
* `sessionConfig` – The configuration for this plugin. Defaults to `server.app.config.sessionAuth` if not truthy.
    * `cookie` – Session id cookie settings
      * `cookie.name` – The name of the cookie to use. Defaults to `ok_idksid`
      * `cookie.options` – Cookie configuration options. This extends hapi.state options, so check there
        * `cookie.options.ttl` – How long the cookie will live (in milliseconds)
        * `cookie.options.encoding` – How to encode the cookie value. Defaults to `none` since it's not a secret to the client
        * `cookie.options.path` – What path to set on cookies. Defaults to `/`. Not setting this to `/`, you may end up creating duplicate cookies on different paths of the domain.
        * `cookie.options.isSecure` – Whether to only allow access to the cookie on secure connections. Defautls to `true`. You'll want to set this to `false` when on HTTP.
    * `redirectTo` – The path to redirect to if not authenticated. Defaults to `/login`. Set to `null` or exclude to disable.
    * `appendNext` – Whether to append a parameter `next` to the login url, specifying where to redirect after authentication. Defaults to `true`
    * `redirectOnTry` – Whether to redirect if there is no active session. Defaults to `true`
    * `validateFunc(request, cachedSession, callback)` – Function to fire to perform authentication
      * `request` – The HAPI request requesting authentication validation
      * `cachedSession` – Cached session object, if available
      * `callback(err, isValid, res)` – Function to fire when done with your authentication handling
        * `err` – If there was an unhandled error performing authentication 
        * `isValid` – Whether the authentication was successful or not
        * `res` – Boom response indicating what went wrong during authentication
* `cache` – The HAPI cache instance to use for storing session data. Defaults to in-memory cache with configuration: `{ segment: 'sessions', expiresIn: TWO_WEEKS }`
* `callback(err)` – Function that is fired when setup is completed. If `err` is present, something went wrong.
    
# `request.session` 
This plugin adds a `session` object to each HAPI request, so it is available in other plugins or route handlers.

* `request.session.sid` – The string ID of the session or `null` if not defined
* `request.session.data` – The data stored in the session or `{}` if not loaded
* `request.session.loaded` – Whether the session was loaded yet or not, depending on where in the HAPI lifecycle you are
* `request.session.start(context, callback)` – Function to start a new session on the current request
  * `context` – The data to store in the session 
  * `callback` – Function to fire when session has been started 
* `request.session.destroy(callback)` – Terminates an active session
  * `callback` – Function to fire when session has been destroyed

## Extending and Contributing 

Our goal is quality-driven development. Please ensure that 100% of the code is covered with testing.

Before contributing pull requests, please ensure that changes are covered with unit tests, and that all are passing. 

### Testing

To run unit tests and code coverage:
```sh
npm run report
```

This will perform:
* Unit tests
* Code coverage report
* Code linting

Sometimes, that's overkill to quickly test a quick change. To run just the unit tests:
 
```sh
npm test
```

or if you have mocha installed globally, you may run `mocha test` instead.
