var https = require("https"),
    express = require("express"),
    bodyParser = require("body-parser"),
    request = require("request"),
    Protocol = require("../lib/passport-tequila/protocol"),
    multiline = require("multiline");

'use strict';

/**
 * A fake Tequila server.
 *
 * @property port The port number to listen to. Must be set no later than
 *   .start() time, otherwise a port number is selected.
 * @constructor
 */
var TequilaServer = exports.TequilaServer = function() {
    this.createdRequests = {};
    var app = this.app = express();
    var parser = bodyParser.text();
    app.use(function(req, res, next) {
        if (req.method === "POST" && ! req.headers['content-type']) {
            // Real Tequila server doesn't seem to care about the content type
            req.headers['content-type'] = "text/plain";
        }
        return parser(req, res, next);
    });

    var protocol = new Protocol();
    app.post(protocol.tequila_createrequest_path,
        this.do_createrequest.bind(this));
    app.get(protocol.tequila_fetchattributes_path,
        this.do_fetchattributes.bind(this));
};

TequilaServer.prototype.start = function(done) {
    var self = this;
    var server = HTTPSServer(self.app);
    server.listen(0, function(error) {
        if (error) {
            done(error);
        } else {
            self.port = server.address().port;
            done();
        }
    });
};

TequilaServer.prototype.do_createrequest = function(req, res, next) {
    var key = this.newKey();
    this.createdRequests[key] = Protocol.txt2dict(req.body);
    res.set("Content-Type", "text/plain; charset=UTF-8\n").send(new Buffer("key=" + key + "\n"));
};

TequilaServer.prototype.newKey = function() {
    var key = 12345;
    while(String(key) in this.createdRequests) {
        key = key + 1;
    }
    return String(key);
};


TequilaServer.prototype.do_fetchattributes = function(req, res) {
    res.send('Hello World!');
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
// No leading whitespace allowed - Be careful not to reindent!

var fakeCert = exports.certificate = multiline(function() { /*
-----BEGIN CERTIFICATE-----
MIICFDCCAX2gAwIBAgIJAPk4T3QL6eNUMA0GCSqGSIb3DQEBCwUAMCMxDTALBgNV
BAoMBHRlc3QxEjAQBgNVBAMMCWxvY2FsaG9zdDAeFw0xNjAyMTUxNTMyNThaFw0y
NjAyMTIxNTMyNThaMCMxDTALBgNVBAoMBHRlc3QxEjAQBgNVBAMMCWxvY2FsaG9z
dDCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkCgYEAtiDnFgt2H+larAOAwQ8drzyc
mAtbsHkyhEXE28anaZeyACb1MDxpzh4cG+Hy0yggiekORFPmjGsY3weGVTnANJK6
6FhqrQjrejl1oh0milv550tV+pFyyQ2a8gagbF3efKU1YixBA9nqyWA9uWHj2nLL
nfd9aKPS7iOqedQZ6UECAwEAAaNQME4wHQYDVR0OBBYEFGdKsgCwRxFBYl068ADv
UMYPCVsLMB8GA1UdIwQYMBaAFGdKsgCwRxFBYl068ADvUMYPCVsLMAwGA1UdEwQF
MAMBAf8wDQYJKoZIhvcNAQELBQADgYEAD4ExR63rqegQQ8tWoBjP2ytk+pU9Zfwr
QpyxGctrbjH8UmU0F9grTpXpmk8lEirb60pvzCyCy9fvjqYjaw72PgKnD/QvG8Xo
7GJPF2N1gVfSnlGvFTq6QyPXq8fM6kZkCfFj2FbSTDtfzauWCZdGzi84JRB3Oxs7
KQiZrnTMFcg=
-----END CERTIFICATE-----
*/});

var fakeKey = multiline(function() { /*
-----BEGIN PRIVATE KEY-----
MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBALYg5xYLdh/pWqwD
gMEPHa88nJgLW7B5MoRFxNvGp2mXsgAm9TA8ac4eHBvh8tMoIInpDkRT5oxrGN8H
hlU5wDSSuuhYaq0I63o5daIdJopb+edLVfqRcskNmvIGoGxd3nylNWIsQQPZ6slg
Pblh49pyy533fWij0u4jqnnUGelBAgMBAAECgYAhHhiHJKxlHxyyvKxT7ri6Ha5n
42DX1SH/dWRXhmb4x3HBn1PkYofmyAjadRqflONd0Hgcqpj4nZzXKVoe8zJkzeCZ
ydivuH3pL/n/nQryvX3XHYcYXRUccoq/cDmHOEV6nBLElVryqXYJMBZdFMWYYevE
Oqeaim1p4M0od8Z/AQJBAPJQrrwTccBNuwcDbCQfRd5yqVY0AWbL12zOR+9Cfrws
9D3lthbH9ZRuTxAs0WL7RH26gXBBf5BDxmoEsw9nO1ECQQDAag90HcxY4svwMSEi
aXdOnuxs/03HsjtiC+3YiHPw3F7Nfhockmzu9qyp6b23ZvXn6q1ULNNxhadSuhex
MXLxAkEAyIUd5AOPOVzZrXcWkVnTvr5SBUTp+AAtWBvoCUWUjPICeApUwctdHSSf
hrof1/IofobNQHDjOCXt1qPm7ZM20QJAOydgIN6YWCtBb1JrUV0DJNSO8uN6Ug5l
Wzs3n/4zRrU5IAvIk0gg3UZQxtvpS10H9IidSOePCbOBQVmctwjwwQJBAPGYg4PL
Y3Bs0u9IVS6HhVLCTdorgcxDs03czDK819UZmZb7O8jdc5QlJBniLBR/lrHV3IbJ
y4S/YbSQ7jvaGxU=
-----END PRIVATE KEY-----
*/});

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
}

