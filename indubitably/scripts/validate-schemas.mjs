import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mappings = new Map([
  ['agent-manifest.json', 'agent-manifest.schema.json'],
  ['job-spec.json', 'job-spec.schema.json'],
  ['application.json', 'application.schema.json'],
  ['submission.json', 'submission.schema.json'],
  ['verification-report.json', 'verification-report.schema.json']
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkFormat(format, value) {
  if (format === 'date-time') return !Number.isNaN(Date.parse(value)) && /T/.test(value);
  if (format === 'uri') {
    try { new URL(value); return true; } catch { return false; }
  }
  if (format === 'hostname') {
    return value.length <= 253 && /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(value);
  }
  return true;
}

function validate(schema, value, path = '$') {
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) fail(`must be one of ${JSON.stringify(schema.enum)}`);

  if (schema.type) {
    const validType = {
      object: isObject(value),
      array: Array.isArray(value),
      string: typeof value === 'string',
      integer: Number.isInteger(value),
      number: typeof value === 'number' && Number.isFinite(value),
      boolean: typeof value === 'boolean'
    }[schema.type];
    if (!validType) {
      fail(`must be ${schema.type}`);
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`length must be >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`length must be <= ${schema.maxLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) fail(`must match ${schema.pattern}`);
    if (schema.format && !checkFormat(schema.format, value)) fail(`must satisfy ${schema.format}`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail(`must be > ${schema.exclusiveMinimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validate(schema.items, item, `${path}[${index}]`)));
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: is required`);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validate(properties[key], child, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: additional property is not allowed`);
      } else if (isObject(schema.additionalProperties)) {
        errors.push(...validate(schema.additionalProperties, child, `${path}.${key}`));
      }
    }
  }

  return errors;
}

let failures = 0;
for (const [exampleName, schemaName] of mappings) {
  const [data, schema] = await Promise.all([
    readFile(join(root, 'examples', exampleName), 'utf8').then(JSON.parse),
    readFile(join(root, 'schemas', schemaName), 'utf8').then(JSON.parse)
  ]);
  const errors = validate(schema, data);
  if (errors.length) {
    failures += 1;
    console.error(`${exampleName} failed ${schemaName}`);
    for (const error of errors) console.error(`  ${error}`);
  } else {
    console.log(`validated ${exampleName}`);
  }
}

if (failures > 0) process.exit(1);
console.log(`validated ${mappings.size} protocol examples`);
