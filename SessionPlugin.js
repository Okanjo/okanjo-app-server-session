"use strict";

exports.SessionCookiePlugin = require('./SessionCookiePlugin');

/**
 * Helper to register the plugin with OkanjoServer
 * @param {OkanjoServer} server
 * @param {*} [options]
 * @param {*} [cache]
 * @param [callback]
 * @return {Promise<any>}
 */
exports.register = (server, options, cache, callback) => {
    return new Promise(async (resolve, reject) => {

        // Take the cache however you want to give it
        options = options || {};
        options.report = options.report || server.app.report.bind(server.app);
        if (cache) {
            options.cache = cache;
        }

        // Register the plugin
        try {
            await server.hapi.register({
                plugin: exports.SessionCookiePlugin,
                options,
            });
        } catch(err) {
            if (callback) callback(err);
            return reject(err);
        }

        if (callback) callback();
        resolve();
    });
};