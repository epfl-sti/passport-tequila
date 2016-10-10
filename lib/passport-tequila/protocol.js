/**
 * API-neutral Tequila protocol implementation.
 *
 * Follows the terminology of [Lecommandeur-eunis-2005]; functions
 * are named after the URLs on the Tequila server (see also
 * [Lecommandeur-WritingClients]).
 *
 * [Lecommandeur-eunis-2005] Tequila. A distributed Web
 * authentication and access control tool, Claude Lecommandeur,
 * Ecole Polytechnique Fédérale de Lausanne, EUNIS 2005
 *
 * [Lecommandeur-WritingClients] Tequila: Writing Clients,
 * https://tequila.epfl.ch/download/2.0/docs/writing-clients.odt
 *
 * [mod_tequila-config] Apache Module - Tequila Identity Management,
 * https://tequila.epfl.ch/download/2.0/docs/apache-module-config.pdf
 */

var https = require('https'),
    os = require("os"),
    debug = require("debug")("passport-tequila:protocol");

var defaults = {};

defaults.myhostname = os.hostname();
defaults.tequila_host = (function () {
    var hostname_bits = defaults.myhostname.split(".");
    hostname_bits[0] = "tequila";
    if (hostname_bits.length == 1) {
        // os.hostname() is not qualified; take a guess
        return "tequila.epfl.ch";
    } else {
        return hostname_bits.join(".");
    }
})();

/**
 * Obtain an initial authentication ticket from the Tequila server.
 *
 * This is step 1 of § 2, "Local authentication" in [Lecommandeur-eunis-2005].
 *
 * @param req The request object
 * @param res The response object
 * @param done Called as done(e) upon error, done(null, tok) upon success.
 * @property tequila_server The host name of the Tequila server
 * @property tequila_port The port number of the Tequila server (HTTP/S is mandatory)
 * @property service The app-provided service name (like TequilaService in [mod_tequila-config])
 * @property require A filter expression (e.g. "username=~.") (like TequilaAllowIf in [mod_tequila-config])
 * @property request A list of user identity fields to fetch, e.g. ['name', 'firstname']
 *         (like TequilaRequest in [mod_tequila-config])
 */
var Protocol = module.exports = function () {
    this.service = defaults.service;
    this.client = "node-passport-tequila";
    this.tequila_host = defaults.tequila_host;
    this.tequila_port = 443;
    this.tequila_createrequest_path = "/cgi-bin/tequila/createrequest";
    // Not /requestauth, as erroneously stated in [Lecommandeur-WritingClients]:
    this.tequila_requestauth_path = "/cgi-bin/tequila/auth";
    this.tequila_fetchattributes_path = "/cgi-bin/tequila/fetchattributes";
    this.tequila_logout_path = "/cgi-bin/tequila/logout";
};

Protocol.prototype.createrequest = function(req, res, done) {
    debug("createrequest: called for request to " + req.originalUrl);

    var teq_options = {
        client: "node-passport-tequila",
        urlaccess: this.redirectUrl(req, req.originalUrl),
        service: this.service || ("Document " + req.originalUrl),
        ca: this.ca
    };
    if (this.require) {
        teq_options.require = this.require;
    }
    if (this.request) {
        teq_options.request = this.request.join(",");
    }

    this._teqRequest(this.tequila_createrequest_path, teq_options, done);
};

Protocol.prototype.requestauth = function(res, tequila_answers) {
    var portFragment = "";
    if (this.tequila_port != 443) {
        portFragment = ":" + this.tequila_port;
    }
    var redirectUrl = "https://" + this.tequila_host +
          portFragment +
          this.tequila_requestauth_path + "?" +
          "requestkey=" + tequila_answers["key"];
    if (res.redirect) {
        res.redirect(redirectUrl);
    } else {  // Plain connect, e.g. from Meteor
        res.writeHead(307, { 'Location': redirectUrl });
        res.end();
    }
};

/**
 * Do the fetchattributes Tequila request.
 *
 * Ensure that the response contains a status=ok line (otherwise, synthesize a TequilaServerError)
 *
 * @param key The Tequila key (passed as key= URI parameter when redirected back from Tequila)
 * @param {Function} done Called either as done(error), or done(null, raw_tequila_result_object)
 */
Protocol.prototype.fetchattributes = function (key, done) {
    this._teqRequest(this.tequila_fetchattributes_path,  {key: key}, function (error, result) {
        if (error) {
            debug("fetchattributes: Tequila error.");
            done(error);
        } else if (result.status !== "ok") {
            debug("fetchattributes: Tequila status is: " + result.status);
            done(new TequilaServerError("status=" + result.status));
        } else {
            debug("fetchattributes: Tequila login successful, results: " + dict2txt(result));
            done(null, result);
        }
    });
};

Protocol.prototype.logout = function (req, res, redirectUri) {
    res.redirect("https://" + this.tequila_host +
        this.tequila_logout_path + "?urlaccess=" +
        this.redirectUrl(req, redirectUri));
};

Protocol.prototype._teqRequest = function(path, teq_options, done) {
    var teq_post_payload = dict2txt(teq_options);
    debug("_teqRequest to https://" + this.tequila_host + path +"\n" +
          teq_post_payload);
    var https_options = {
        hostname: this.tequila_host,
        port: this.tequila_port,
        path: path,
        method: 'POST',
        headers: {
            'Content-Length': teq_post_payload.length
        },
        agent: this.agent || https.globalAgent   // Injectable for tests
    };
    var teq_req = https.request(https_options, function (res) {
        if (res.statusCode != 200) {
            new TequilaServerError(https_options.path).collect(res, done);
            return;
        }
        var buf = '';
        res.on("data", function (txt) {
            buf += txt;
        });
        res.on("end", function () {
            done(null, txt2dict(buf));
        });
    });
    teq_req.on("error", function (e) {
        done(e);
    });
    teq_req.write(teq_post_payload);
    teq_req.end();
};

Protocol.prototype.redirectUrl = function(req, url) {
    var protocol = req.protocol || "http";
    var hostport = req.headers['x-forwarded-host'] || req.headers['host'];
    if (! hostport) {
        var port;
        if (req.app) {  // Express
            port = req.app.settings.port;
        } else {
            port = protocol == "https" ? 443 : 80;
        }
        hostport = defaults.myhostname + ( port == 80 || port == 443 ? '' : ':' + port );
    }
    return protocol + '://' + hostport + url;
}

module.exports.defaults = defaults;

var dict2txt =
module.exports.dict2txt =  // Exported for tests
function dict2txt(dict, opt_operator) {
    if (! opt_operator) {
        opt_operator = "=";
    }
    return Object.keys(dict).map(function (k) {
        return k + opt_operator + dict[k] + "\r\n";
    }).join("").slice(0, -2);
};

var txt2dict =
module.exports.txt2dict =  // Exported for tests
function txt2dict(txt, opt_operator) {
    if (! opt_operator) {
        opt_operator = "=";
    }
    var dict = {};
    txt.split("\n").forEach(function (line) {
        line = line.replace(/\r$/, "");
        var sepIndex = line.indexOf(opt_operator);
        if (sepIndex == -1) {
            if (line.length) debug("Skipping bogus line: " + line);
            return;
        }
        var k = line.slice(0, sepIndex);
        var v = line.slice(sepIndex + opt_operator.length);
        dict[k] = v;
    });
    return dict;
};

/**
 * The Tequila server is signaling an error.
 *
 * @constructor
 *
 * @param reason What we were doing when the situation arose, as free-form text.
 */
var TequilaServerError = exports.TequilaServerError = function(reason) {
    this.reason = reason;
};

TequilaServerError.prototype = Object.create(Error.prototype);

/**
 * Collect the information about a failed request to the Tequila server.
 *
 * @param res The response object, as provided to the https callback.
 * @param done The done callback, as provided to createrequest or fetchattributes
 */
TequilaServerError.prototype.collect = function(res, done) {
    var self = this;
    self.code = res.statusCode;
    self.headers = {};
    Object.keys(res.headers).forEach(function (k) {
        self.headers[k] = res.headers[k];
    });
    self.body = '';
    res.on("data", function (txt) {
        self.body += txt;
    });
    res.on("end", function () {
        done(self);
    })
};

TequilaServerError.prototype.toString = function () {
    var self = this;
    var buf = 'TequilaServerError\n\n' + self.reason;
    if (self.code) {
        buf += "\n" + this.code + "\n";
        buf += dict2txt(self.headers, ": ");
        buf += "\n" + this.body;
    }
    return buf;
};
