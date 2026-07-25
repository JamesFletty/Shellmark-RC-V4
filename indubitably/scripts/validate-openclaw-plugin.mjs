import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginRoot = join(root, 'plugins', 'openclaw-indubitably');
const [manifest, packageJson, source] = await Promise.all([
  readFile(join(pluginRoot, 'openclaw.plugin.json'), 'utf8').then(JSON.parse),
  readFile(join(pluginRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(join(pluginRoot, 'src', 'index.ts'), 'utf8')
]);

const failures = [];
if (manifest.id !== 'indubitably') failures.push('manifest id must be indubitably');
if (!packageJson.openclaw?.extensions?.includes('./dist/index.js')) failures.push('package must ship the built dist/index.js entry');
if (!String(packageJson.peerDependencies?.openclaw ?? '').includes('2026.5.17')) failures.push('OpenClaw peer dependency must preserve the verified SDK floor');
const contractTools = manifest.contracts?.tools ?? [];
if (new Set(contractTools).size !== contractTools.length) failures.push('manifest tool contracts must be unique');
const registeredTools = [...source.matchAll(/register\("([a-z0-9_]+)"/g)].map((match) => match[1]);
for (const tool of contractTools) {
  if (!registeredTools.includes(tool)) failures.push(`manifest tool is not registered in source: ${tool}`);
}
for (const tool of registeredTools) {
  if (!contractTools.includes(tool)) failures.push(`registered tool is missing from manifest contracts: ${tool}`);
}
for (const [tool, metadata] of Object.entries(manifest.toolMetadata ?? {})) {
  if (metadata.optional !== true) failures.push(`toolMetadata.${tool} must only declare optional=true`);
  if (!contractTools.includes(tool)) failures.push(`optional tool metadata references an unknown tool: ${tool}`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`validated OpenClaw plugin manifest and ${contractTools.length} registered tools`);
