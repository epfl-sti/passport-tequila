'use strict';

function weakRequire(modulePath) {
    try {
        return require(modulePath);
    } catch (e) {
        return undefined;
    }
}

// Note: because getOptions() is useful also for an out-of-process server,
// this file ought to remain useful (loadable) even if the dev dependencies
// are not available.
var https = require("https"),
    express = weakRequire("express"),
    bodyParser = weakRequire("body-parser"),
    request = weakRequire("request"),
    os = require("os"),
    Protocol = require("../lib/passport-tequila/protocol"),
    pem = weakRequire("pem"),
    ip = weakRequire("ip"),
    fs = require("fs"),
    EventEmitter = require("events").EventEmitter;

var txt2dictBodyParser = function () {
    var textParser = bodyParser.text();
    return function(req, res, next) {
        if (req.method === "POST" && ! req.headers['content-type']) {
            // Real Tequila server doesn't seem to care about the content type
            req.headers['content-type'] = "text/plain";
        }
        return textParser(req, res, function (error) {
            if (error) return next(error);
            if (typeof req.body === 'string') {
                req.teqParams = Protocol.txt2dict(req.body);
            }
            return next();
        });
    }
};

/**
 * A fake Tequila server.
 *
 * @property port The port number to listen to. Must be set no later than
 *   .start() time, otherwise a port number is selected.
 * @constructor
 */
var TequilaServer = exports.TequilaServer = function() {
    this.state = {};
    var app = this.app = express();
    app.use(txt2dictBodyParser());
    addUrlMap(app, this);
};

TequilaServer.prototype.start = function(done) {
    var self = this;
    var server = new HTTPSServer(self.app);
    server.listen(self.port || 0, function(error) {
        if (error) {
            done(error);
        } else {
            self.port = server.address().port;
            done();
        }
    });
};

function respondWithDict(res, dict) {
    res.set("Content-Type", "text/plain; charset=UTF-8").send(new Buffer(
        Protocol.dict2txt(dict)));
}

TequilaServer.prototype.newKey = function() {
    var key = 12344;
    while(String(++key) in this.state) {}
    return String(key);
};


TequilaServer.prototype.getOptions = function() {
    if (! this.port) {
        throw new Error("Cannot getOptions() before start() completes");
    }
    return {
        tequila_host: "localhost",
        tequila_port: this.port,
        agent: new https.Agent({ca: fakeCACert})
    }
};

/************************ Serving *******************************/

function addUrlMap(app, that) {
    var protocol = new Protocol();
    app.get(protocol.tequila_requestauth_path,
        that.do_requestauth.bind(that));
    app.get("/requestauth_submit",
        that.do_requestauth_submit.bind(that));
    app.post(protocol.tequila_createrequest_path,
        that.do_createrequest.bind(that));
    app.post(protocol.tequila_fetchattributes_path,
        that.do_fetchattributes.bind(that));
}

TequilaServer.prototype.do_createrequest = function(req, res, next) {
    var key = this.newKey();
    this.state[key] = req.teqParams;
    respondWithDict(res, {key: key});
};

TequilaServer.prototype.do_requestauth = function(req, res, next) {
    res.send("<html>\n" +
            "<head>\n" +
            "<title>Fake Tequila Server</title></head>\n" +
            "<body>\n" +
            "<h1>Fake Tequila Server</h1>" +
            "<p>Whom would you like to impersonate today?</p>" +
            "<form action='/requestauth_submit' method='GET'>\n" +
            "<input type='hidden' id='requestkey' name='requestkey' " +
            "       value='" + req.query.requestkey + "'>\n" +
            "<label for='uniqueid'>SCIPER:</label>" +
            "<input type='text' id='uniqueid' name='uniqueid' value='243371'><br/>\n" +
            "<label for='displayname'>Display name:</label>" +
            "<input type='text' id='displayname' name='displayname' value='Dominique Quatravaux'><br/>\n" +
            "<input type='submit'>\n" +
            "</form></body></html>\n");
};

TequilaServer.prototype.do_requestauth_submit = function(req, res, next) {
    var responseKey = this.newKey();
    this.state[responseKey] = {
        status: "ok",
        requestkey: req.query.requestkey,
        uniqueid: req.query.uniqueid,
        displayname: req.query.displayname
    };
    var urlaccess = this.state[req.query.requestkey].urlaccess;
    res.redirect(urlaccess + "?key=" + responseKey);
};

TequilaServer.prototype.do_fetchattributes = function(req, res, next) {
    respondWithDict(res, this.state[req.teqParams.key]);
};

/**
 * A fake request object.
 * @param url
 * @constructor
 */
var Request = exports.Request = function(url) {
    this.originalUrl = url;
    this.headers = {};
};

/**
 * A fake response object.
 * @constructor
 */
var Response = exports.Response = function() {
};

// Key and certificate were generated with
//
//   openssl req -x509 -nodes -days 10000 -newkey rsa:2048 \
//        -keyout /dev/stdout -batch \
//        -subj "/O=passport-tequila/CN=passport-tequila test CA"
//

var fakeCACert = fs.readFileSync(__dirname + "/ca/ca.crt"),
    fakeCAKey = fs.readFileSync(__dirname + "/ca/ca.key");

/**
 * A fake HTTP/S server.
 * @constructor
 */
var HTTPSServer = exports.HTTPSServer = function(handler) {
    var keysReady = new EventEmitter(),
        keys;
    
    getNextSerial(function(err, serial) {
        if (err) return handler(err);
        getAllAltNames(function (err, altNames) {
            if (err) return handler(err);
            pem.createCertificate(
                {
                    days:365,
                    serviceKey: fakeCAKey,
                    serviceCertificate: fakeCACert,
                    serial: serial,
                    organization: "passport-tequila",
                    commonName: "fake Passport-Tequila server",
                    altNames: altNames
                },
                function(err, data) {
                    if (err) return handler(err);
                    keys = data;
                    keysReady.emit("ready");
                });
        });
    });

    var server;
    return {
        listen: function(port, cb) {
            keysReady.once("ready", function() {
                // console.log(keys.certificate + "\n" + keys.clientKey);
                server = https.createServer({
                    cert: keys.certificate,
                    key: keys.clientKey
                }, handler);
                server.listen(port, cb);
            });
            if (keys) keysReady.emit("ready");
        },
        address: function() {
          return server.address();
        }
    };
};

function getAllAltNames(done) {
    var interfaces = os.networkInterfaces(),
        altNames = ["localhost", os.hostname()];
    function addAltName(altName) {
        if (altNames.indexOf(altName) === -1) {
            altNames.push(altName);
        }
    }
    for (var ifname in interfaces) {
        interfaces[ifname].forEach(function(address) {
            addAltName(address.address);
        });
    }
    var fqdn = require("fqdn");
    fqdn(function(err, res) {
        if (err) return done(err);
        altNames.push(res);
        done(null, altNames);
    });
}

function requestWithFakeCA(params) {
  if (! params.agentOptions) params.agentOptions = {};
  params.agentOptions.ca = fakeCACert;
  return request(params, params.callback);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

/* Firefox hates certs with the same serial from the same CA. */
function getNextSerial(cb) {
    cb(null, getRandomInt(1, Math.pow(2, 32)));
}

/**
 * Like real request, but accepts the fake cert as legitimate
 */
exports.request = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  return requestWithFakeCA(params);
};

exports.request.post = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  params.method = "post";
  return requestWithFakeCA(params);
};

exports.request.get = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  params.method = "get";
  return requestWithFakeCA(params);
};

/**
 * @returns {string} The certificate of the CA that clients must trust
 */
exports.getCACert = function() {
    return fakeCACert;
};
