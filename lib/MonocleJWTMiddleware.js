// TODO: should be in separate library - monocle-jwt


module.exports = function(options) {
  this._options = options;


  var middleware = function(req, res, next) {
    /*
        TODO: monocle-jwt - Parse JWT token, verify signature if auth check is configured. Store JWT tokens in Monocle
        requests. Scopes does not have to come from a JWT token (at TMG they will), but for other users of Monocle
        it makes it more flexible if we separate this into a separate step.

        This can probably be very similar to: https://github.com/auth0/express-jwt/blob/master/lib/index.js
    } */
  };

  return middleware;
};