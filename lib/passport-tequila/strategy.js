/**
 * Passport-style API for Tequila.
 */

var debug = require("debug")("passport-tequila:strategy"),
    passport = require('passport-strategy'),
    Protocol = require('./protocol.js'),
    url = require('url'),
    util = require('util');

/**
 * @constructor
 * @type {Function}
 *
 * @param {String} opts.service The app-provided service name (like TequilaService in the Apache config)
 * @param {Array} opts.request The list of personal data fields to fetch, e.g. ["firstname", "displayname"]
 * @param {Array} opts.require A Tequila filter on authorized users, e.g. group=somegroup
 * @param {Array} opts.redirectAfterAuth Whether to try and get rid of the unsightly ?key= parameter by
 *                redirecting once more upon successful Tequila authentication - Requires proper session
 *                management to avoid the obvious redirect loop
 * @property ensureAuthenticated Simple connect middleware to ensure that the user is authenticated.
 *
@ * Use this on any resource that needs to be protected, e.g.
 *
 *   app.get('/private', myTequilaStrategy.ensureAuthenticated, function(req, res){
 *      // Serve here – Can access req.user
 *   });
 */
var Strategy = module.exports = function TequilaStrategy(opts) {
    if (! opts) opts = {};

    var protocol = this.protocol = new Protocol();
    protocol.service = opts.service || "Some node.js app";
    protocol.request = opts.request;
    protocol.require = opts.require;
    ["tequila_host", "tequila_port", "tequila_createrequest_path", "tequila_requestauth_path",
     "tequila_fetchattributes_path", "tequila_logout_path"].forEach(function (k) {
           if (opts[k]) protocol[k] = opts[k];
        });

    var self = this;
    this.ensureAuthenticated = function (req, res, next) {
        if (req.isAuthenticated()) { return next(); }
        debug("Not authenticated at " + req.originalUrl);
        if (req.query && req.query.key) {
            debug("Looks like user is back from Tequila, with key=" + req.query.key);
            protocol.fetchattributes(req.query.key, function (error, results) {
                if (error) {
                    next(error);
                } else {
                    req.login(teqResult2User(results), function(error) {
                        if (error) {
                            next(error);
                        } else if (opts.redirectAfterAuth) {
                            res.redirect(self.protocol.redirectUrl(req, url.parse(req.originalUrl).pathname));
                        } else if(req.query.key){
                            res.redirect(removeParam("key",self.protocol.redirectUrl(req, req.originalUrl)));
                        } else {
                            next();
                        }
                    });
                }
            });
        } else {
            debug("Making first contact with Tequila");
            protocol.createrequest(req, res, function (err, results) {
                if (err) {
                    next(err);
                } else {
                    debug("Redirecting user to Tequila");
                    protocol.requestauth(res, results);
                }
            });
        }
    };

    this.globalLogout = function (redirectUrl) {
        return function (req, res) {
            req.logout();
            protocol.logout(req, res, redirectUrl);
        };
    };
};

/**
 * Convert a Tequila result dict into a Passport-style user structure
 *
 * @param result A dict like {user: "lecom", firstname, "Claude"} etc.
 * @returns A data structure conforming to http://passportjs.org/guide/profile/
 */
function teqResult2User(result) {
    var user = {
        provider: "tequila",
        id: result.user
    };

    if (result.displayname) {
        user.displayName = result.displayname;
    }
    if (result.name) {
        if (! user.name) user.name = {};
        user.name.familyName = result.name;
    }
    if (result.firstname) {
        if (! user.name) user.name = {};
        user.name.givenName = result.firstname;
    }
    Object.keys(result).forEach(function (k) {
        if (! user.tequila) user.tequila = {};
        user.tequila[k] = result[k];
    });
    return user;
}

util.inherits(Strategy, passport.Strategy);

Strategy.prototype.name = "tequila";

/*
* Remove the specified key parameter from the sourceurl
*
* @param key The key name to remove
* @param sourceUrl the url containing the key to remove
* @returns the finalUrl without the key
*/
function removeParam(key, sourceURL) {
    var cleanedURL = sourceURL.split("?")[0],
        currentParam,
        params = [],
        queryString = (sourceURL.indexOf("?") !== -1) ? sourceURL.split("?")[1] : "";
    if (queryString !== "") {
        params = queryString.split("&");
        for (var i = params.length - 1; i >= 0; i--) {
            currentParam = params[i].split("=")[0];
            if (currentParam === key) {
                params.splice(i, 1);
            }
        }
        cleanedURL = cleanedURL + (params.length > 0 ? '?' + params.join('&') : "");
    }
    return cleanedURL;
}