/**
 * Small, strict validator for the JSON Schema subset used by TurtlePen tools.
 *
 * MCP clients normally validate before a call, but direct handlers, nested
 * plan operations, and incomplete clients must mean the same thing. Refusing
 * malformed input here keeps every entry point on one contract.
 */

function schemaError(path, message) {
  throw new SyntaxError(`${path}: ${message}`);
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value === 'number' ? 'number' : typeof value;
}

function matchesType(expected, value) {
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'array') return Array.isArray(value);
  return typeof value === expected;
}

export function assertSchema(schema, value, path = 'arguments') {
  if (!schema) return value;

  if (Array.isArray(schema.oneOf)) {
    const matches = [];
    for (const candidate of schema.oneOf) {
      try {
        assertSchema(candidate, value, path);
        matches.push(candidate);
      } catch {
        // Only the count matters; the unified error below names the field.
      }
    }
    if (matches.length !== 1) schemaError(path, `must match exactly one allowed shape (matched ${matches.length})`);
    return value;
  }

  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((type) => matchesType(type, value))) {
      schemaError(path, `expected ${expected.join(' or ')}, got ${typeOf(value)}`);
    }
  }

  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    const label = path.split(/[.\[]/).at(-1).replace(/\]$/, '') || 'value';
    const values = schema.enum.map(String);
    const allowed = values.length > 1
      ? `${values.slice(0, -1).join(', ')}${values.length > 2 ? ',' : ''} or ${values.at(-1)}`
      : values[0];
    schemaError(path, `unknown ${label} ${JSON.stringify(value)} — expected one of ${allowed}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      schemaError(path, `must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern != null && !(new RegExp(schema.pattern)).test(value)) {
      schemaError(path, `does not match required pattern ${schema.pattern}`);
    }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) schemaError(path, 'must be finite');
    if (schema.minimum != null && value < schema.minimum) schemaError(path, `must be at least ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) schemaError(path, `must be at most ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      schemaError(path, `must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) value.forEach((item, index) => assertSchema(schema.items, item, `${path}[${index}]`));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) schemaError(`${path}.${required}`, 'is required');
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) assertSchema(properties[key], child, `${path}.${key}`);
      else if (schema.additionalProperties === false) schemaError(`${path}.${key}`, 'is not allowed');
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        assertSchema(schema.additionalProperties, child, `${path}.${key}`);
      }
    }
  }

  return value;
}
