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