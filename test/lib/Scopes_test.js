var Router = require('../../lib/Router');
var Request = require('../../lib/Request');
var Route = require('../../lib/Route');
var RequestRouter = require('../../lib/RequestRouter');

var Resource = require('../../lib/Resource');
var OffsetPaginator = require('../../lib/OffsetPaginator');
var Connection = require('../../lib/Connection');
var Symlink = require('../../lib/Symlink');
var HttpStatusCodes = require('../../lib/HttpStatusCodes');
var Promise = require('bluebird');
var jsen = require('jsen');
var errorSchema = require('../../lib/schemas/error');


// TODO Fix: Most tests in here are not working yet because the functionality is not implemented yet. TDD!

describe('Router Scope handling', function() {

    describe('scopes resource filtering', function() {
        beforeEach(function() {
            this.httpRequest = new Request("/foo/1");
            this.httpRequest.setResourceId("/foo/1");

            var httpResponse = {};
            this.router = new Router();
            this.clock = sinon.useFakeTimers(10000000);
            this.connection = new Connection(this.router, this.httpRequest, httpResponse);

            // Set up "/foo/:fooId" resource -- sync
            this.fooSchema = {
                type: 'object',
                scopes: { read: ['read:foo'] },
                properties: {
                    fooId: { type: 'integer' },
                    foo: { type: 'string' },
                    secretField: { type: 'string', scopes: { read: ['read:secretField'] }, },
                }
            };


            // Mocked handler
            this.getFooSpy = sinon.spy(function(request, connection) {
              return new Promise(function(resolve, reject) {
                resolve({
                  foo: 'test foo',
                  secretField: 'something very secret',
                });
              });
            });

            this.router.route('/foo/:fooId', this.fooSchema, {
              get: this.getFooSpy
            });
        });

        afterEach(function() {
            this.clock.restore();
        });

        describe('when having sufficient read permissions for resource', function() {
            beforeEach(function() {
              this.httpRequest.setRequestScopes(['read:foo']);
            });
            it('should allow access if specified scope is in request', function () {
              return this.connection.get('/foo/1')
                .then(function(response) {
                  response.should.be.ok;
                }).bind(this);
            });
        });

        describe('when lacking read permissions for resource', function() {
          beforeEach(function() {
            this.httpRequest.setRequestScopes([]);
          });

          it('should NOT allow access', function () {

            return this.connection.get('/foo/1')
              .then(function(response) {
                return Promise.reject('Did not expect success');
              }).catch(function(error) {

                error.should.deep.equal({
                  code: 2403,
                  error: 'FORBIDDEN',
                  message: 'Access to resource or field not allowed',
                  properties: [],
                  '$httpStatus': 403,
                  '$httpMessage': "FORBIDDEN"
                });
              }.bind(this));
          })
        });

        describe('when having sufficient read permissions for resource but lacking for a specific field', function() {
          beforeEach(function() {
            this.httpRequest.setRequestScopes(['read:foo']);
          });
          it('should allow access but the response should not include the field the request lacks access to', function () {
            return this.connection.get('/foo/1')
              .then(function(response) {
                response.should.be.ok;
                response.should.not.have.property('secretField');

              }).bind(this);
          });
        });

        describe('when requesting only a field that the request lacks access to', function() {
          beforeEach(function() {
            this.httpRequest.setRequestPermissions([]);
          });

          it('should NOT allow access', function () {

            return this.connection.get('/foo/1?props=secretField')
              .then(function(response) {
                return Promise.reject('Did not expect success');
              }).catch(function(error) {

                error.should.deep.equal({
                  code: 2403,
                  error: 'FORBIDDEN',
                  message: 'Access to resource or field not allowed',
                  properties: [],
                  '$httpStatus': 403,
                  '$httpMessage': "FORBIDDEN"
                });
              }.bind(this));
          })
        });
    });
});
