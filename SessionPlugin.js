"use strict";

exports.SessionCookiePlugin = require('./SessionCookiePlugin');

/**
 * Helper to register the plugin with OkanjoServer
 * @param {OkanjoServer} server
 * @param {*} [options]
 * @param {*} [cache]
 * @return {Promise<any>}
 */
exports.register = (server, options, cache) => {
    return new Promise((resolve, reject) => {

        // Take the cache however you want to give it
        options = options || {};
        options.report = options.report || server.app.report.bind(server.app);
        if (cache) {
            options.cache = cache;
        }

        const done = () => {
            resolve();
        };

        // Register the plugin
        server.hapi.register({
            plugin: exports.SessionCookiePlugin,
            options,
        })
            .then(
                () => done(),
                err => {
                    return reject(err);
                }
            )
        ;
    });
};