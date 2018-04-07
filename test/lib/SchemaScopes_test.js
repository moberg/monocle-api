const SchemaScopes = require('../../lib/SchemaScopes');
const jsen = require('jsen');
const errorSchema = require('../../lib/schemas/error');
const assert = require('assert');

describe('SchemaScopes', function () {
  beforeEach(function () {

    this.complexSchema = {
      type: 'object',
      scopes: {read: {'read:x': 'scope x'}},
      properties: {
        field1: {type: 'integer'},
        field2: {type: 'string', scopes: {read: {'read:y': 'scope y'}},},

        location: {
          scopes: {read: {'read:location': 'scope location'}},

          type: 'object',
          properties: {
            country: {type: 'string'},
            state: {type: 'string'},
            city: {type: 'string'},

            latitude: {type: 'float', scopes: {read: {'read:pii': 'scope pii'}}},
            longitude: {type: 'float', scopes: {read: {'read:pii': 'scope pii'}}},
            inner: {
              type: 'object',
              scopes: {read: {'read:inner': 'scope inner'}},

              properties: {
                somefield: {type: 'string'},
                data: {
                  type: 'object',
                  properties: {
                    a: {
                      type: 'float', scopes: {read: {'read:a': 'scope a'}},
                    },
                    b: {type: 'string'},
                  },
                },
              }
            },
          }
        },

        someCollection: {
          type: 'object',
          scopes: {read: {'read:collection': 'read collection'}},
          properties: {
            id: {
              type: 'string',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id2: {
                    type: 'string',
                  },
                  details: {
                    scopes: {read: {'read:collection:details': 'Read details'}},
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    }

    this.schemaScopes = new SchemaScopes(this.complexSchema);
  });

  describe('transformSchema()', function () {
    describe('with no scopes', function () {
      it('the transformed schema should not have any scopes', function () {

        const schema = {
          type: 'object',
          properties: {
            field1: {type: 'integer'},
            field2: {type: 'integer'},
          }
        };

        var props = SchemaScopes.transformSchema(schema)
        assert.deepEqual(props[0].scopes.read, new Set([]));
        assert.deepEqual(props[1].scopes.read, new Set([]));
      });
    });

    describe('given a schema with read scope on the resource', function () {
      it('the transformed schema should have the read scope on each property', function () {

        const schema = {
          type: 'object',
          scopes: {read: {'read:x': 'scope x'}},
          properties: {
            field1: {type: 'integer'},
            field2: {type: 'integer'},
          }
        };

        var props = SchemaScopes.transformSchema(schema)
        assert.deepEqual(props[0].scopes.read, new Set(['read:x']));
        assert.deepEqual(props[1].scopes.read, new Set(['read:x']));
      });
    });


    describe('given a schema with read scope on the resource and an additional read scope on one property', function () {
      it('the transformed schema should reflect this', function () {
        const schema = {
          type: 'object',
          scopes: {read: {'read:x': 'scope x'}},
          properties: {
            field1: {type: 'integer'},
            field2: {type: 'string', scopes: {read: {'read:y': 'scope y'}},},
          }
        };

        var props = SchemaScopes.transformSchema(schema)
        assert.deepEqual(props[0].scopes.read, new Set(['read:x']));
        assert.deepEqual(props[1].scopes.read, new Set(['read:x', 'read:y']));
      });
    });


    describe('given a more complex schema', function () {
      it('the transformed schema should reflect this', function () {
        var props = SchemaScopes.transformSchema(this.complexSchema);

        assert.deepEqual(props.field('field1').read, new Set(['read:x']));
        assert.deepEqual(props.field('field2').read, new Set(['read:x', 'read:y']));
        assert.deepEqual(props.field('location.latitude').read, new Set(['read:x', 'read:location', 'read:pii']));
        assert.deepEqual(props.field('location.longitude').read, new Set(['read:x', 'read:location', 'read:pii']));
        assert.deepEqual(props.field('location.state').read, new Set(['read:x', 'read:location']));
        assert.deepEqual(props.field('location.city').read, new Set(['read:x', 'read:location']));

        assert.deepEqual(props.field('location.inner.somefield').read, new Set(['read:x', 'read:location', 'read:inner']));
        assert.deepEqual(props.field('location.inner.data.a').read, new Set(['read:x', 'read:location', 'read:inner', 'read:a']));
        assert.deepEqual(props.field('location.inner.data.b').read, new Set(['read:x', 'read:location', 'read:inner']));

        assert.deepEqual(props.field('someCollection.id').read, new Set(['read:x', 'read:collection']));
        assert.deepEqual(props.field('someCollection.id').read, new Set(['read:x', 'read:collection']));
      });


      it('should handle arrays correctly', function () {
        var props = SchemaScopes.transformSchema(this.complexSchema);
        assert.deepEqual(props.field('someCollection.id').read, new Set(['read:x', 'read:collection']));
        assert.deepEqual(props.field('someCollection.items@id2').read, new Set(['read:x', 'read:collection']));
        assert.deepEqual(props.field('someCollection.items@details').read, new Set(['read:x', 'read:collection', 'read:collection:details']));
      });
    });
  });

  describe('canAccessResource()', function () {
    describe('given no scopes', function () {
      it('it should not allow access to the resource', function () {
        assert(this.schemaScopes.canAccessResource([]) === false);
      });
    });

    describe('read scope for resource', function () {
      it('it should allow access to the resource', function () {
        assert(this.schemaScopes.canAccessResource(['read:x']) === true);
      });
    });
  });

  describe('filterProps()', function () {
    describe('given no requested fields', function () {
      describe('given scopes', function () {
        it('it should return the correct filtered props', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x']);
          assert.deepEqual(filtered, ['field1']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y']);
          assert.deepEqual(filtered, ['field1', 'field2']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y', 'read:location']);
          assert.deepEqual(filtered, ['field1', 'field2', 'location.country', 'location.state', 'location.city']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y', 'read:location', 'read:pii']);
          assert.deepEqual(filtered, ['field1', 'field2', 'location.country', 'location.state', 'location.city', 'location.latitude', 'location.longitude']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y', 'read:location', 'read:pii']);
          assert.deepEqual(filtered, ['field1', 'field2', 'location.country', 'location.state', 'location.city', 'location.latitude', 'location.longitude']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y', 'read:location', 'read:inner']);
          assert.deepEqual(filtered, ['field1', 'field2', 'location.country', 'location.state', 'location.city', 'location.inner.somefield', 'location.inner.data.b']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:y', 'read:location', 'read:inner', 'read:a']);
          assert.deepEqual(filtered, ['field1', 'field2', 'location.country', 'location.state', 'location.city', 'location.inner.somefield', 'location.inner.data.a', 'location.inner.data.b']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:collection']);
          assert.deepEqual(filtered, ['field1', 'someCollection.id', 'someCollection.items@id2']);
        });
      });

      describe('given scopes', function () {
        it('it should allow access to the resource', function () {
          const filtered = this.schemaScopes.filterProps([], ['read:x', 'read:collection', 'read:collection:details']);
          assert.deepEqual(filtered, ['field1', 'someCollection.id', 'someCollection.items@id2', 'someCollection.items@details']);
        });
      });
    });

    describe('given requested fields', function () {
      describe('given scopes', function () {
        it('it should return the correct filtered props', function () {
          const filtered = this.schemaScopes.filterProps(['someCollection.id', 'location.country', 'field2'], ['read:x', 'read:collection']);
          assert.deepEqual(filtered, ['someCollection.id']);
        });
      });
    });
  });
});

