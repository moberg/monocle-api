var Promise = require('bluebird');
var _ = require('lodash');
var pathToRegexp = require('path-to-regexp');
var EventEmitter = require('events').EventEmitter;
var jsen = require('jsen');
var validateSchema = jsen({"$ref": "http://json-schema.org/draft-04/schema#"});
var Request = require('./Request');

module.exports = Router;

function Router() {
    this._routes = [];
    this._eventEmitter = new EventEmitter();
}

/**
 * Registers a callback to be fired on the specified event.
 *
 * @param string event - Event name.
 * @param function callback - Callback to be invoked on event.
 * @return this - fluent interface.
 */
Router.prototype.on = function(event, callback) {
    this._eventEmitter.on(event, callback);
    return this;
};


Router.prototype.route = function(pattern, schema, handlers) {
    // Validate the schema
    var isSchemaValid = validateSchema(schema);
    if (!isSchemaValid) {
        throw new Error("Invalid schema");
    }

    // Generate a regex to match URLs
    var keys = [];
    var regex = pathToRegexp(pattern, keys); // keys are passed in by reference

    this._routes.push({
        pattern: pattern,
        schema: schema,
        handlers: handlers,
        regex: regex,
        keys: keys
    });

    return this;
};

Router.prototype.get = function(resourceId, options) {
    var request = new Request(resourceId);
    request.setResourceId(resourceId);
    request.setMethod(Request.METHOD_GET);
    return this.handle(request);
};

Router.prototype.handle = function(request) {
    var handlers = [];
    var route = null;
    var lcMethod = request.getMethod().toLowerCase();
    var resourceId = request.getResourceId();

    // Loop through requests to find matching resource
    for (var i = 0, len = this._routes.length; i < len; i++) {
        route = this._routes[i];

        var match = resourceId.match(route.regex);

        if (!match) {
            continue;
        }

        for (var i = 0, len = route.keys.length; i < len; i++) {
            var paramName = route.keys[i].name;
            var paramValue = match[i + 1];

            if (typeof paramValue == 'undefined') {
                paramValue = null;
            }

            // Make sure numbers are numeric
            if (route.schema.properties.hasOwnProperty(paramName)) {
                switch (route.schema.properties[paramName].type) {
                    case 'integer':
                        paramValue = parseInt(paramValue);
                        break;

                    case 'number':
                        paramValue = parseFloat(paramValue);
                        break;
                }
            }

            request.setParam(paramName, paramValue);
        }

        // Support OPTIONS
        if ('options' === lcMethod) {
            // Discover supported methods
            var methods = [];
            for (var i in route.handlers) {
                if (!route.handlers.hasOwnProperty(i)) {
                    continue;
                }
                switch (i) {
                    case 'get':
                    case 'post':
                    case 'put':
                    case 'patch':
                    case 'delete':
                        methods.push(i.toUpperCase());
                }
            };

            methods.push('OPTIONS'); // Always supported

            return Promise.resolve({
                schema: route.schema,
                methods: methods
            });
        }

        if (!route.handlers.hasOwnProperty(lcMethod)) {
            return Promise.reject({ error: "No " + lcMethod + " handler for " + resourceId });
        }

        if (_.isFunction(route.handlers[lcMethod])) {
            handlers.push(route.handlers[lcMethod]);
            break;
        }

        if (_.isArray(route.handlers[lcMethod])) {
            var props = request.getProps();

            if (props.length) {
                route.handlers[lcMethod].filter(function(handler) {
                    return _.intersection(request.getProps(), handler.props).length;
                }).forEach(function(handler) {
                    handlers.push(handler.callback);
                });
            } else {
                route.handlers[lcMethod].forEach(function(handler) {
                    handlers.push(handler.callback);
                });
            }
        }

        break;
    }

    if (!handlers.length) {
        return Promise.reject('No handlers');
    }

    var callbacks = handlers.map(function(handler) {
        this._eventEmitter.emit('api:handler', {
            resourceId: resourceId,
            schema: route.schema,
            request: request
        });
        return handler.call(this, request);
    }.bind(this));

    return Promise.all(callbacks)
    .then(function(results) {
        results = results.map(function(result) {
            if (_.isArray(result)) {
                return result.map(function(r) {
                    if (typeof r.toRepresentation == 'function') {
                        return r.toRepresentation();
                    }

                    return r;
                });
            } else if (_.isObject(result)) {
                // duck typing
                if (typeof result.toRepresentation == 'function') {
                    return result.toRepresentation();
                }
            }

            return result;
        });

        var result = _.merge.apply(null, results);

        var props = request.getProps();
        if (props.length) {
            // Remove all unneeded props
            for (var i in result) {
                if (!result.hasOwnProperty(i)) continue;
                if (i[0] === '$') continue;
                if (-1 === props.indexOf(i)) delete result[i];
            }

            props.forEach(function(prop) {
                if (result.hasOwnProperty(prop)) return;

                // Check if param can be reflected from request
                var reflectedParam = request.getParam(prop);
                if (reflectedParam) result[prop] = reflectedParam;
            });

            var unfound = props.filter(function(prop) {
                return !result.hasOwnProperty(prop);
            });

            if (unfound.length) {
                this._eventEmitter.emit('api:error', {
                    resourceId: resourceId,
                    schema: route.schema,
                    request: request
                });

                return Promise.reject("Unable to resolve props " + unfound.join(', ') + " for resource " + resourceId);
            }
        }

        var validate = jsen(route.schema);
        var valid = validate(result);

        if (!valid) {
            return Promise.reject({
                message: 'Return value did not validate with schema',
                errors: validate.errors,
                schema: route.schema,
                data: result
            });
        }

        return result;
    });
};

// Utility function to send a JSON response
var respondJson = function(res, obj) {
    res.setHeader('Content-Type', 'application/json');

    try {
        var body = JSON.stringify(obj, null, 2) + '\n';
    } catch (e) {
        res.statusCode = 500;
        var body = JSON.stringify({
            error: 'Unable to stringify to JSON',
            exceptin: e
        }, null, 2);
    }

    res.end(body);
};

/**
 * Returns a function that can be used as connect middleware.
 *
 * The middleware will call next() if the request does not start with the configured base path.
 * Otherwise, the api router will kick and and try to handle the request.
 *
 * @param object options - Custom options
 *      basePath (default: '/') - base path to mount your API to.
 * @return function
 */
Router.prototype.middleware = function(options) {
    var querystring = require('querystring');
    var config = _.assign({
        basePath: '/'              // Allow APIs to be accessible from a configured base path
    }, options || {});

    // Determine how much of the path to trim based on the number of characters leading up to the trailing `/`
    var basePathLength = (config.basePath || '').replace(/\/$/, '').length;

    return function(req, res, next) {
        // Continue if request is not under configured base path
        if (config.basePath && req.url.indexOf(config.basePath) !== 0) {
            return next();
        }

        var request = new Request(req.url);
        var parsedUrl = request.getUrl();
        request.setMethod(parsedUrl.query._method || req.method);
        request.setResourceId(req.url.substr(basePathLength).replace(/\?.*/, ''));
        if (req.body) {
            request.setResource(req.body);
        }

        this.handle(request).then(function(result) {
            respondJson(res, result);
        }).catch(function(error) {
            res.statusCode = 404;
            respondJson(res, {
                error: 'Not found',
                exception: error
            });
        }.bind(this));
    }.bind(this);
};