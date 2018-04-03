// TODO: should be in separate library monocle-scopes

module.exports = function(options) {
  this._options = options;


  var middleware = function(req, res, next) {
    /*
      TODO: Filter incoming request resource and fields based on the scopes available in the request

      For example, if the schema has a property like:

      latitude: {
      type: 'float',
        scopes: {
        'read:self': 'read your own latitude',
        'read:tmg:profile:pii': 'read any user\'s latitude'
      }

      The property latitude should only be requested if the user is requesting his own user object OR
      if he has the scope 'read:tmg:profile:pii'

    } */
  };

  return middleware;
};