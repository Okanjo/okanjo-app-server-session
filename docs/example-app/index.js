"use strict";

const OkanjoApp = require('okanjo-app');
const OkanjoServer = require('okanjo-app-server');
// const SessionPlugin = require('okanjo-app-server-session');
const SessionPlugin = require('../../SessionPlugin');

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