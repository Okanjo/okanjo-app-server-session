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

