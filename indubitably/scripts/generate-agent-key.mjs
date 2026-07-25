import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const privatePath = resolve(process.argv[2] ?? './data/keys/agent-ed25519.pem');
const publicPath = resolve(process.argv[3] ?? `${privatePath}.pub`);
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
await mkdir(dirname(privatePath), { recursive: true });
await mkdir(dirname(publicPath), { recursive: true });
await writeFile(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
await writeFile(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644, flag: 'wx' });
console.log(JSON.stringify({ private_key_path: privatePath, public_key_path: publicPath }, null, 2));
