var SchemaScopes = function(schema) {
  this._schema = schema;
  this._props = SchemaScopes.transformSchema(schema);
};


SchemaScopes.prototype.canAccessResource = function (scopes) {
  if (this._schema.scopes && this._schema.scopes.read) {
    for (const scope of scopes) {
      if (this._schema.scopes.read.hasOwnProperty(scope)) {
        return true;
      }
    }
  }

  return false;
};

SchemaScopes.prototype.filterProps = function (requestedProps, scopes) {
  const allowed = this._props
    .filter(x => x.scopes.read.size === 0
        || (scopes.filter(y => x.scopes.read.has(y)).length === x.scopes.read.size)
    )
    .map(x => x.prefix);

  if (requestedProps.length === 0) {
    return allowed;
  }

  return requestedProps.filter(r => allowed.indexOf(r) > -1);
};



/*
 * Transforms the scopes on the schema to a representation per object/field. Scopes are inherrited down so if the top
 * level resource requires scope:top, and a field requires scope:field, the field requires scope:top AND scope:field.
 *
 *  This should only be executed once per schema and then cached.
 *
 * {
 *  type: 'object',
 *  scopes: { read: {'scope:top': 'Read access'} }
 *  properties: {
 *   a: { type: 'float', scopes: { read: { read: {'scope:field': 'Read access'} } },
     b: { type: 'float' },
     c: { type: 'object', properties: {cc: { type: 'number' }} },
 *  }
 *
 *  ==>
 *
 * [
 *   {
 *   {
 *     "prefix": "a",
 *     "scopes": {
 *       "read": ['scope:top', 'scope:field'},
 *       "write": {}
 *     }
 *   },
 *   {
 *     "prefix": "b",
 *     "scopes": {
 *       "read": ['scope:top', 'scope:field'},
 *       "write": {}
 *   },
 *   {
 *     "prefix": "c.cc",
 *     "scopes": {
 *       "read": ['scope:top'},
 *       "write": {}
 *     }
 *   }
 * ]
 *
 */

SchemaScopes.transformSchema = function (schema) {
  var transformedSchema = this._scopesPerProp(schema, []);

  transformedSchema.field = function(name) {
    for (const field of this) {
      if (field.prefix === name) {
        return field.scopes;
      }
    }
    throw `${name} not found`
  };

  return transformedSchema;
};

const flatMap = (f, arr) => arr.reduce((x, y) => [...x, ...f(y)], []); // TODO: move to some util package

const collectionTypes = new Set(['object', 'array']);
SchemaScopes._scopesPerProp = function (prop, scopes, prefix, separator) {
  separator = separator === undefined ? '.' : separator;

  if (prop.hasOwnProperty('scopes')) {
    scopes = scopes.concat([prop.scopes]);
  }

  if (!collectionTypes.has(prop.type)) {
    const read = flatMap(f => f, scopes.map(s => s.hasOwnProperty('read') ? Object.keys(s.read) : []));
    const write = flatMap(f => f, scopes.map(s => s.hasOwnProperty('write') ? Object.keys(s.write) : []));
    return {prefix, scopes: {read: new Set(read), write: new Set(write)}};
  }

  var result = [];
  if (prop.type === 'object') {
    if (prop.hasOwnProperty('properties')) {
      for (key of Object.keys(prop.properties)) {
        const property = prop.properties[key];
        const p2 = prefix !== undefined ? `${prefix}${separator}${key}` : key;

        let items = SchemaScopes._scopesPerProp(property, scopes, p2, ".");
        result = result.concat(items);
      }
    }
  } else if (prop.type === 'array') {
    if (prop.hasOwnProperty('items')) {
      let items = SchemaScopes._scopesPerProp(prop.items, scopes, prefix, "@");
      result = result.concat(items);
    }
  }

  return result;
};

module.exports = SchemaScopes;
