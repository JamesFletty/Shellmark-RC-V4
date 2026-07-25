import { resolve } from 'node:path';

function integerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

export function loadConfig() {
  const root = resolve(process.env.INDUBITABLY_DATA_DIR ?? './data');
  const adminToken = process.env.INDUBITABLY_ADMIN_TOKEN;
  if (!adminToken || adminToken.length < 24) {
    throw new Error('INDUBITABLY_ADMIN_TOKEN must be set to at least 24 characters.');
  }
  return {
    host: process.env.INDUBITABLY_HOST ?? '127.0.0.1',
    port: integerEnv('INDUBITABLY_PORT', 8787),
    dataDir: root,
    eventLogPath: resolve(root, 'events.ndjson'),
    noncePath: resolve(root, 'nonces.json'),
    artifactDir: resolve(root, 'artifacts'),
    signingKeyPath: resolve(root, 'keys', 'platform-ed25519.pem'),
    validatorWorkspaceRoot: resolve(process.env.INDUBITABLY_VALIDATOR_WORKSPACE_ROOT ?? './validator-workspaces'),
    adminToken,
    maximumBodyBytes: integerEnv('INDUBITABLY_MAX_BODY_BYTES', 16 * 1024 * 1024),
    maximumArtifactBytes: integerEnv('INDUBITABLY_MAX_ARTIFACT_BYTES', 10 * 1024 * 1024)
  };
}
