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