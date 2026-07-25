import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { MemoryArtifactStore } from '../src/infrastructure/artifact-store.mjs';
import { JsonArtifactValidator } from '../src/validators/json-artifact-validator.mjs';

test('artifact store verifies expected SHA-256', async () => {
  const store = new MemoryArtifactStore();
  const bytes = Buffer.from('{"status":"ok"}');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const stored = await store.putBase64({ contentBase64: bytes.toString('base64'), expectedSha256: sha256, mediaType: 'application/json' });
  assert.equal(stored.sha256, sha256);
  await assert.rejects(
    () => store.putBase64({ contentBase64: bytes.toString('base64'), expectedSha256: '0'.repeat(64), mediaType: 'application/json' }),
    (error) => error.code === 'ARTIFACT_HASH_MISMATCH'
  );
  await assert.rejects(
    () => store.putBase64({ contentBase64: 'not-base64', mediaType: 'application/json' }),
    (error) => error.code === 'ARTIFACT_BASE64_INVALID'
  );
});

test('JSON artifact validator produces deterministic acceptance evidence', async () => {
  const store = new MemoryArtifactStore();
  const stored = await store.putBase64({ contentBase64: Buffer.from(JSON.stringify({ status: 'ok', score: 98 })).toString('base64'), mediaType: 'application/json' });
  const validator = new JsonArtifactValidator({ artifactStore: store });
  const report = await validator.run({
    artifact: stored,
    config: {
      assertions: [
        { criterion_id: 'status', pointer: '/status', operator: 'equals', expected: 'ok' },
        { criterion_id: 'score', pointer: '/score', operator: 'minimum', expected: 90 }
      ]
    }
  });
  assert.equal(report.aggregate_result, 'accepted');
  assert.match(report.evidence_hash, /^[a-f0-9]{64}$/);
});
