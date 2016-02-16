var assert = require('assert'),
    chai = require('chai'),
    expect = chai.expect,
    chaiAsPromised = require('chai-as-promised'),
    Q = require('Q'),
    _ = require('underscore');

chai.use(chaiAsPromised);
chai.should();

var Protocol = require('../../lib/passport-tequila/protocol.js'),
    fakes = require('../fakes'),
    request = fakes.request;

describe("protocol.js", function() {
    var server = new fakes.TequilaServer();
    before(function(done) {
        server.start(done);
    });
    it("createrequest", function(done) {
        var protocol = new Protocol();
        _.extend(protocol, server.getOptions());
        var req = new fakes.Request("/");

        Q.ninvoke(protocol, "createrequest", req, new fakes.Response())
            .should.be.fulfilled.then(function(tequilaResult) {
                assert(tequilaResult.key);
            })
            .should.notify(done);
    });
});
