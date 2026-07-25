import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignored = new Set(['node_modules', '.git']);
const forbidden = [
  /\bTO\s*DO\b/i,
  /\bT\s*B\s*D\b/i,
  /placeholder text/i,
  /lorem ipsum/i
];
const checkedExtensions = new Set(['.md', '.json', '.yml', '.yaml', '.mjs', '.ts']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else if (checkedExtensions.has(extname(entry.name))) results.push(path);
  }
  return results;
}

const required = [
  'README.md',
  'SECURITY.md',
  'docs/strategy.md',
  'docs/architecture.md',
  'docs/mvp.md',
  'docs/roadmap.md',
  'docs/security-model.md',
  'docs/phase0-implementation.md',
  'docs/api.md',
  'docs/request-signing.md',
  'docs/operations.md',
  'plugins/openclaw-indubitably/openclaw.plugin.json',
  'plugins/openclaw-indubitably/src/index.ts'
];

let failures = 0;
for (const path of required) {
  try {
    await readFile(join(root, path), 'utf8');
  } catch {
    console.error(`missing required file: ${path}`);
    failures += 1;
  }
}

for (const path of await walk(root)) {
  if (relative(root, path) === 'scripts/validate-docs.mjs') continue;
  const content = await readFile(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      console.error(`unfinished marker ${pattern} in ${relative(root, path)}`);
      failures += 1;
    }
  }
}

if (failures > 0) process.exit(1);
console.log('documentation and repository completeness checks passed');
