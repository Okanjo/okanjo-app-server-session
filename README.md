# Okanjo Server Session Plugin  

[![Build Status](https://travis-ci.org/Okanjo/okanjo-app-server-session.svg?branch=master)](https://travis-ci.org/Okanjo/okanjo-app-server-session) [![Coverage Status](https://coveralls.io/repos/github/Okanjo/okanjo-app-server-session/badge.svg?branch=master)](https://coveralls.io/github/Okanjo/okanjo-app-server-session?branch=master)

Plugin to enable cross-server, persistent session state storage.

This plugin:
 * uses a cookie for session id storage on clients
 * registers a HAPI authentication strategy: `session`
 * decorates the `request` object with `request.session` to access and modify the session state
 * changes made to the session data are saved before the response is sent

## Installing

Add to your project like so: 

```sh
npm install okanjo-app-server-session
```

Note: requires 
* [`okanjo-app`](https://github.com/okanjo/okanjo-app) module.
* [`okanjo-app-server`](https://github.com/okanjo/okanjo-app-server) module.


## Breaking Changes

### Version 2.0.0
 * Supports Hapi v17 and up. 
 * Registration changed from v1.x.
 * Configuration changed from v1.x.
 
> Note: Use okanjo-app-server-session@^1.x for Hapi 16 and below. 

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

    // Home page, requires you to be logged in to view
    server.hapi.route({
        method: 'GET',
        path: '/',
        handler: (/*request, h*/) => {

            //noinspection HtmlUnknownTarget
            return 'YOU ARE AUTHENTICATED. <a href="/data">view session contents</a> or <a href="/logout">logout</a>?';

        },
        config: {
            auth: 'session'
        }
    });


    // Shows the data stored in the session on the server side
    server.hapi.route({
        method: 'GET',
        path: '/data',
        handler: (request/*, h*/) => {

            return `<code>${JSON.stringify(request.session.data, null, '  ')}</code> <a href="/modify">make modification</a> or <a href="/">go back home</a>`;

        },
        config: {
            auth: 'session'
        }
    });


    // Modifies a key in the session with a random value to show how it automatically updates
    server.hapi.route({
        method: 'GET',
        path: '/modify',
        handler: (request, h) => {

            // Change the value (saved automatically)
            request.session.data.things = Math.random();

            return h.redirect('/data');
        },
        config: {
            auth: 'session'
        }
    });


    // Example login page, if already authenticated, will take you back to where you should go
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
            return `YOU ARE NOT AUTHENTICATED. Go <a href="/">home</a> (hint, you'll bounce back here) or <a href="/login/start?${request.query.next ? 'next=' + encodeURIComponent(request.query.next) : ''}">authenticate?</a>`;
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
        handler: async (request, h) => {

            if (request.auth.isAuthenticated) {
                // already authenticated, don't clobber the existing session
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
                        expiry: "2030-01-01T00:00:00-06:00"
                    }
                };

                // start the session
                await request.session.start(exampleSessionRes);

                // return to where they ought to go
                if (request.query.next) {
                    return h.redirect(request.query.next);
                } else {
                    return h.redirect('/');
                }
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
        handler: async (request, h) => {

            // terminate the session
            await request.session.destroy();

            // return to login
            return h.redirect('/login');
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
        hapiServerOptions: {
            port: 5555,

            //// Uncomment this section if you want to store your session data in redis
            //// Useful for live environments
            // cache: [
            //         {
            //             name: 'myRedisCache',
            //             engine: require('catbox-redis'),
            //             host: '127.0.0.1',
            //             port: 6379,
            //             database: 0,
            //             partition: 'my-app-cache'
            //         }
            //     ]
        },
        routePath: Path.join(__dirname, 'routes'),
    },
    sessionAuth: { // see hapi-auth-cookie for more options
        cookie: 'my_app_sid',
        ttl: TWO_WEEKS,
        isSecure: false,
        path: '/',
        redirectTo: '/login?param=present',
        appendNext: true,
        keepAlive: true
    }
};
```

### `example-app/index.js`
This is the main app, which binds the plugin and starts the server.
```js
"use strict";

const OkanjoApp = require('okanjo-app');
const OkanjoServer = require('okanjo-app-server');
// const SessionPlugin = require('okanjo-app-server-session');
const SessionPlugin = require('../../SessionPlugin');

const config = require('./config');
const app = new OkanjoApp(config);

app.connectToServices(async () => {

    const options = {
        extensions: [
            async function() {

                let cache = null;

                // Uncomment if you want to enable redis storage (also update config.js)
                // const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days
                // cache = this.hapi.cache({
                //     cache: 'myRedisCache',
                //     segment: 'mySessions',
                //     expiresIn: TWO_WEEKS
                // });

                await SessionPlugin.register(this, app.config.sessionAuth, cache);
            }
        ]
    };

    const server = new OkanjoServer(app, app.config.webServer, options);

    await server.start();

    console.log('Visit this URL in a browser: %s', server.hapi.info.uri);

});
```

A runnable version of this application can be found in [docs/example-app](https://github.com/okanjo/okanjo-app-server-session/tree/master/docs/example-app).

## `SessionPlugin.SessionCookiePlugin`

The complete Hapi-compatible plugin. Can be used if you don't wish OkanjoServer at all.

## `SessionPlugin.register(server, [sessionConfig, [cache, [callback]]])`

The plugin exports a function which installs the plugin.

* `server` – The OkanjoServer instance to bind to
* `sessionConfig` – The configuration for this plugin. Extension of [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie) scheme config.
    - `cookie` - the cookie name. Defaults to `'sid'`.
    - `ttl` - sets the cookie expires time in milliseconds. Defaults to single browser session (ends
      when browser closes). Required when `keepAlive` is `true`.
    - `domain` - sets the cookie Domain value. Defaults to none.
    - `path` - sets the cookie path value. Defaults to `/`.
    - `clearInvalid` - if `true`, any authentication cookie that fails validation will be marked as
      expired in the response and cleared. Defaults to `false`.
    - `keepAlive` - if `true`, automatically sets the session cookie after validation to extend the
      current session for a new `ttl` duration. Defaults to `false`.
    - `isSameSite` - if `false` omitted. Other options `Strict` or `Lax`. Defaults to `Strict`.
    - `isSecure` - if `false`, the cookie is allowed to be transmitted over insecure connections which
      exposes it to attacks. Defaults to `true`.
    - `isHttpOnly` - if `false`, the cookie will not include the 'HttpOnly' flag. Defaults to `true`.
    - `redirectTo` - optional login URI or function `function(request)` that returns a URI to redirect unauthenticated requests to. Note that it will only
      trigger when the authentication mode is `'required'`. To enable or disable redirections for a specific route,
      set the route `plugins` config (`{ options: { plugins: { 'hapi-auth-cookie': { redirectTo: false } } } }`).
      Defaults to no redirection.
    - `appendNext` - if `redirectTo` is `true`, can be a boolean, string, or object. Defaults to `false`.
        - if set to `true`, a string, or an object, appends the current request path to the query component
          of the `redirectTo` URI
        - set to a string value or set the `name` property in an object to define the parameter name.
          defaults to `'next'`
        - set the `raw` property of the object to `true` to determine the current request path based on
          the raw node.js request object received from the HTTP server callback instead of the processed
          hapi request object
    - `async validateFunc` - an optional session validation function used to validate the credentials on each request. Used to verify that the internal session state is still valid
      (e.g. user account still exists). The function has the signature `function(request, sessionState)`
      where:
        - `request` - is the Hapi request object of the request which is being authenticated.
        - `sessionState` - is the session object cached on the server.
    
      Must return an object that contains:
        - `valid` - `true` if the content of the session is valid, otherwise `false`.
        - `error` – Optional error response to return. Defaults to `Boom.unauthorized()`
    - `requestDecoratorName` - *USE WITH CAUTION* an optional name to use with decorating the `request` object.  Defaults to `'session'`.  Using multiple decorator names for separate authentication strategies could allow a developer to call the methods for the wrong strategy.  Potentially resulting in unintended authorized access.
    - `cache` – The HAPI cache instance to use for storing session data. Defaults to in-memory cache with configuration: `{ segment: 'sessions', expiresIn: TWO_WEEKS }`
    - `report` – Optional error reporting handler with signature `(message, error, data)`. Called if cache operations fail. 
* `cache` – Optional HAPI cache policy to use for storing session data. Defaults to in-memory cache with configuration: `{ segment: 'sessions', expiresIn: TWO_WEEKS }`
* `callback(err)` – Optional function that is fired when setup is completed. If `err` is present, something went wrong.

    
## `request.session` 
This plugin adds a `session` object to each HAPI request, so it is available in other plugins or route handlers.

* `request.session.sid` – The string ID of the session or `null` if not defined
* `request.session.data` – The data stored in the session or `{}` if not loaded
* `request.session.loaded` – Whether the session was loaded yet or not, depending on where in the HAPI lifecycle you are
* `async request.session.start(sessionState, [callback])` – Starts a new session using the given data. Returns a promise or accepts a callback.
  * `sessionState` – The data to store in the session 
  * `callback(err)` – Optional, function to fire when session has been started
* `async request.session.destroy([callback])` – Terminates the active session. Returns a promise or accepts a callback.
  * `callback(err)` – Optional, function to fire when session has been started 

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