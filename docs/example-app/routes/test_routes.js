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

