var Request = require('./Request');

module.exports = Connection;

// A Connection object holds a Router instance, and raw HTTP request and response object.
// It can be used to initiate another request.
function Connection(router, req, res) {
    this.router = router;
    this.raw = {
        req: req,
        res: res
    }
}

// Support various HTTP methods by calling Router's handle method.
[
    Request.METHOD_GET,
    Request.METHOD_POST,
    Request.METHOD_PUT,
    Request.METHOD_PATCH,
    Request.METHOD_DELETE,
    Request.METHOD_OPTIONS
].forEach(function(method) {
    Connection.prototype[method.toLowerCase()] = function (resourceId, options) {
        var request = new Request(resourceId);
        request.setResourceId(resourceId);
        request.setMethod(method);
        return this.router.handle(request, this); // pass self to router's handler
    }
});