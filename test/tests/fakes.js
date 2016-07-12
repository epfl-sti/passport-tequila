var chai = require('chai'),
    expect = chai.expect,
    Q = require('Q'),
    _ = require('underscore'),
    ip = require('ip');

var fakes = require('../fakes'),
    request = fakes.request;

describe("fakes.TequilaServer", function () {
    var server = new fakes.TequilaServer();
    before(function(done) {
        server.start(done);
    });

    it("serves", function (done) {
        Q.nfcall(request, 'https://localhost:' + server.port + "/404")
            .should.be.fulfilled.then(function(callbackArgs) {
            var res = callbackArgs[0];
            expect(res.statusCode).to.equal(404);
        }).should.notify(done);
    });

    var localIp = ip.address();
    it("serves on all interfaces", (! localIp) ? undefined : function (done) {
        Q.nfcall(request, 'https://' + localIp + ':' + server.port + "/404")
            .should.be.fulfilled.then(function (callbackArgs) {
            var res = callbackArgs[0];
            expect(res.statusCode).to.equal(404);
        }).should.notify(done);
    });
    it("serves on /cgi-bin/tequila/createrequest", function (done) {
        Q.nfcall(request.post, {
            url: 'https://localhost:' + server.port +
                "/cgi-bin/tequila/createrequest",
            body: "urlaccess=http://myhost.mydomain/myapp\n" +
                "request=name,firstname\n" +
                "require=group=somegroup\n" +
                "allows=category=guest"
            })
            .should.be.fulfilled.then(function (callbackArgs) {
            var res = callbackArgs[0],
                body = callbackArgs[1];
            expect(res.statusCode).to.equal(200);
            var matched = String(body).match(/key=(.*)/);
            expect(matched).to.be.an('Array');
            var key = matched[1];
            var expectedRequest = {
                urlaccess: "http://myhost.mydomain/myapp",
                request: "name,firstname",
                require: "group=somegroup",
                allows: "category=guest"
            };
            expect(server.state).to.deep.equal(
                _.object([[key, expectedRequest]]));
        }).should.notify(done);
    });
});
