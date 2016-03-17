var assert = require('assert'),
    chai = require('chai'),
    expect = chai.expect,
    chaiAsPromised = require('chai-as-promised'),
    Q = require('Q'),
    _ = require('underscore');

chai.use(chaiAsPromised);
chai.should();

var Startegy = require('../../lib/passport-tequila/strategy.js'),
    fakes = require('../fakes'),
    request = fakes.request,
    Protocol = require('../../lib/passport-tequila/protocol.js');

describe("startegy.js", function() {
    var server = new fakes.TequilaServer();
    before(function(done) {
        server.start(done);
    });

    it("executeVerify", function(done) {
        // var strategy = new Startegy(undefined, myVerify);

        // var protocol = new Protocol();
        // _.extend(protocol, server.getOptions());

        // strategy.protocol = protocol;

        // var req = new fakes.Request("/");
        // req.isAuthenticated = function() {
        //     return true;
        // };

        // strategy.ensureAuthenticated(req, null, function() {
        //     assert(req.user && req.user.isVerified);
        // });
        
        assert(false);
    });
});



function myVerify(accessToken, refreshToken, profile, done) {
    profile.isVerified = true;
    done(null, profile);
};
