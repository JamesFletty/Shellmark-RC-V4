function normalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) {
      output[key] = normalize(value[key]);
    }
  }
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}
