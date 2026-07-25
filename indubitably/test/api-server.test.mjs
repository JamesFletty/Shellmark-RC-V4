import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, sign } from 'node:crypto';
import { createApiServer } from '../src/api/server.mjs';
import { RequestAuthenticator, signableRequest } from '../src/api/request-auth.mjs';
import { MemoryNonceStore } from '../src/infrastructure/nonce-store.mjs';
import { ValidatorRegistry } from '../src/validators/validator-registry.mjs';
import { agentKeys, testContext } from './helpers.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function adminRequest(base, token, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function signedRequest(base, keys, agentId, method, path, body = undefined) {
  const bodyBytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const timestamp = '2026-07-25T12:00:00.000Z';
  const nonce = randomUUID();
  const signed = signableRequest({ method, url: path, timestamp, nonce, bodyBytes });
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-indub-agent-id': agentId,
      'x-indub-timestamp': timestamp,
      'x-indub-nonce': nonce,
      'x-indub-body-sha256': signed.bodyHash,
      'x-indub-signature': sign(null, Buffer.from(signed.message), keys.privateKey).toString('base64')
    },
    body: body === undefined ? undefined : bodyBytes
  });
}

test('serves admin registration and signed agent discovery', async (t) => {
  const { service, signer } = await testContext();
  const adminToken = 'phase-zero-admin-token-123456';
  const clock = () => new Date('2026-07-25T12:00:00Z');
  const authenticator = new RequestAuthenticator({ service, nonceStore: new MemoryNonceStore({ clock }), adminToken, clock });
  const server = createApiServer({ service, authenticator, validators: new ValidatorRegistry(), signer });
  t.after(() => server.close());
  const base = await listen(server);

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);

  const operatorResponse = await adminRequest(base, adminToken, '/v1/admin/operators', { display_name: 'API Operator' });
  assert.equal(operatorResponse.status, 200);
  const operator = (await operatorResponse.json()).data;
  const keys = agentKeys();
  const agentResponse = await adminRequest(base, adminToken, '/v1/admin/agents', {
    operator_id: operator.operator_id,
    display_name: 'API Agent',
    public_key_pem: keys.publicKeyPem
  });
  assert.equal(agentResponse.status, 200);
  const agent = (await agentResponse.json()).data;

  const jobsResponse = await signedRequest(base, keys, agent.agent_id, 'GET', '/v1/jobs');
  assert.equal(jobsResponse.status, 200);
  assert.deepEqual((await jobsResponse.json()).data.jobs, []);
});
