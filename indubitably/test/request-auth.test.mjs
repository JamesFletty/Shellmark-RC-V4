import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, sign } from 'node:crypto';
import { MemoryNonceStore } from '../src/infrastructure/nonce-store.mjs';
import { RequestAuthenticator, signableRequest } from '../src/api/request-auth.mjs';
import { agentKeys, testContext } from './helpers.mjs';

test('verifies signed agent requests and rejects nonce replay', async () => {
  const { service } = await testContext();
  const operator = await service.registerOperator({ display_name: 'Operator' });
  const keys = agentKeys();
  const agent = await service.registerAgent({ operator_id: operator.operator_id, display_name: 'Agent', public_key_pem: keys.publicKeyPem });
  const clock = () => new Date('2026-07-25T12:00:00Z');
  const authenticator = new RequestAuthenticator({ service, nonceStore: new MemoryNonceStore({ clock }), adminToken: 'x'.repeat(24), clock });
  const bodyBytes = Buffer.from(JSON.stringify({ hello: 'world' }));
  const timestamp = clock().toISOString();
  const nonce = randomUUID();
  const signed = signableRequest({ method: 'POST', url: '/v1/jobs', timestamp, nonce, bodyBytes });
  const headers = {
    'x-indub-agent-id': agent.agent_id,
    'x-indub-timestamp': timestamp,
    'x-indub-nonce': nonce,
    'x-indub-body-sha256': signed.bodyHash,
    'x-indub-signature': sign(null, Buffer.from(signed.message), keys.privateKey).toString('base64')
  };
  const actor = await authenticator.requireAgent({ method: 'POST', url: '/v1/jobs', headers, bodyBytes });
  assert.equal(actor.id, agent.agent_id);
  await assert.rejects(
    () => authenticator.requireAgent({ method: 'POST', url: '/v1/jobs', headers, bodyBytes }),
    (error) => error.code === 'NONCE_REUSED'
  );
});
