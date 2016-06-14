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
    Protocol = require("../lib/passport-tequila/protocol");

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
    var server = HTTPSServer(self.app);
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
        agent: new https.Agent({ca: fakeCert})
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
//   openssl req -x509 -nodes -days 3650 -newkey rsa:1024 \
//        -keyout /dev/stdout -batch -subj "/O=test/CN=localhost"
//

var fakeCert = exports.certificate =
    "-----BEGIN CERTIFICATE-----\n" +
    "MIICFDCCAX2gAwIBAgIJAPk4T3QL6eNUMA0GCSqGSIb3DQEBCwUAMCMxDTALBgNV\n" +
    "BAoMBHRlc3QxEjAQBgNVBAMMCWxvY2FsaG9zdDAeFw0xNjAyMTUxNTMyNThaFw0y\n" +
    "NjAyMTIxNTMyNThaMCMxDTALBgNVBAoMBHRlc3QxEjAQBgNVBAMMCWxvY2FsaG9z\n" +
    "dDCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkCgYEAtiDnFgt2H+larAOAwQ8drzyc\n" +
    "mAtbsHkyhEXE28anaZeyACb1MDxpzh4cG+Hy0yggiekORFPmjGsY3weGVTnANJK6\n" +
    "6FhqrQjrejl1oh0milv550tV+pFyyQ2a8gagbF3efKU1YixBA9nqyWA9uWHj2nLL\n" +
    "nfd9aKPS7iOqedQZ6UECAwEAAaNQME4wHQYDVR0OBBYEFGdKsgCwRxFBYl068ADv\n" +
    "UMYPCVsLMB8GA1UdIwQYMBaAFGdKsgCwRxFBYl068ADvUMYPCVsLMAwGA1UdEwQF\n" +
    "MAMBAf8wDQYJKoZIhvcNAQELBQADgYEAD4ExR63rqegQQ8tWoBjP2ytk+pU9Zfwr\n" +
    "QpyxGctrbjH8UmU0F9grTpXpmk8lEirb60pvzCyCy9fvjqYjaw72PgKnD/QvG8Xo\n" +
    "7GJPF2N1gVfSnlGvFTq6QyPXq8fM6kZkCfFj2FbSTDtfzauWCZdGzi84JRB3Oxs7\n" +
    "KQiZrnTMFcg=\n" +
    "-----END CERTIFICATE-----\n";

var fakeKey =
    "-----BEGIN PRIVATE KEY-----\n" +
    "MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBALYg5xYLdh/pWqwD\n" +
    "gMEPHa88nJgLW7B5MoRFxNvGp2mXsgAm9TA8ac4eHBvh8tMoIInpDkRT5oxrGN8H\n" +
    "hlU5wDSSuuhYaq0I63o5daIdJopb+edLVfqRcskNmvIGoGxd3nylNWIsQQPZ6slg\n" +
    "Pblh49pyy533fWij0u4jqnnUGelBAgMBAAECgYAhHhiHJKxlHxyyvKxT7ri6Ha5n\n" +
    "42DX1SH/dWRXhmb4x3HBn1PkYofmyAjadRqflONd0Hgcqpj4nZzXKVoe8zJkzeCZ\n" +
    "ydivuH3pL/n/nQryvX3XHYcYXRUccoq/cDmHOEV6nBLElVryqXYJMBZdFMWYYevE\n" +
    "Oqeaim1p4M0od8Z/AQJBAPJQrrwTccBNuwcDbCQfRd5yqVY0AWbL12zOR+9Cfrws\n" +
    "9D3lthbH9ZRuTxAs0WL7RH26gXBBf5BDxmoEsw9nO1ECQQDAag90HcxY4svwMSEi\n" +
    "aXdOnuxs/03HsjtiC+3YiHPw3F7Nfhockmzu9qyp6b23ZvXn6q1ULNNxhadSuhex\n" +
    "MXLxAkEAyIUd5AOPOVzZrXcWkVnTvr5SBUTp+AAtWBvoCUWUjPICeApUwctdHSSf\n" +
    "hrof1/IofobNQHDjOCXt1qPm7ZM20QJAOydgIN6YWCtBb1JrUV0DJNSO8uN6Ug5l\n" +
    "Wzs3n/4zRrU5IAvIk0gg3UZQxtvpS10H9IidSOePCbOBQVmctwjwwQJBAPGYg4PL\n" +
    "Y3Bs0u9IVS6HhVLCTdorgcxDs03czDK819UZmZb7O8jdc5QlJBniLBR/lrHV3IbJ\n" +
    "y4S/YbSQ7jvaGxU=\n" +
    "-----END PRIVATE KEY-----\n";

/**
 * A fake HTTP/S server.
 */
var HTTPSServer = exports.HTTPSServer = function(handler) {
    return https.createServer({
        cert: fakeCert,
        key: fakeKey
    }, handler);
};

function requestWithFakeCert(params) {
  if (! params.agentOptions) params.agentOptions = {};
  params.agentOptions.ca = fakeCert;
  return request(params, params.callback);
}

/**
 * Like real request, but accepts the fake cert as legitimate
 */
exports.request = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  return requestWithFakeCert(params);
};

exports.request.post = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  params.method = "post";
  return requestWithFakeCert(params);
};

exports.request.get = function(uri, options, callback) {
  var params = request.initParams(uri, options, callback);
  params.method = "get";
  return requestWithFakeCert(params);
};

