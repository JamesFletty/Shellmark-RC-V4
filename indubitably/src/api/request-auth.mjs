import { createHash, timingSafeEqual, verify } from 'node:crypto';
import { invariant } from '../domain/errors.mjs';

function header(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RequestAuthenticator {
  constructor({ service, nonceStore, adminToken, clock = () => new Date(), maximumSkewMs = 5 * 60_000 }) {
    this.service = service;
    this.nonceStore = nonceStore;
    this.adminToken = adminToken;
    this.clock = clock;
    this.maximumSkewMs = maximumSkewMs;
  }

  requireAdmin(headers) {
    const authorization = header(headers, 'authorization');
    invariant(typeof authorization === 'string' && authorization.startsWith('Bearer '), 'ADMIN_AUTH_REQUIRED', 'Admin bearer token is required.', 401);
    invariant(safeEqual(authorization.slice(7), this.adminToken), 'ADMIN_AUTH_INVALID', 'Admin bearer token is invalid.', 401);
    return { type: 'admin', id: 'admin' };
  }

  async requireAgent({ method, url, headers, bodyBytes }) {
    const agentId = header(headers, 'x-indub-agent-id');
    const timestamp = header(headers, 'x-indub-timestamp');
    const nonce = header(headers, 'x-indub-nonce');
    const signatureBase64 = header(headers, 'x-indub-signature');
    const suppliedBodyHash = header(headers, 'x-indub-body-sha256');
    invariant(agentId && timestamp && nonce && signatureBase64 && suppliedBodyHash, 'AGENT_AUTH_REQUIRED', 'Signed agent request headers are required.', 401);

    const timestampMs = Date.parse(timestamp);
    invariant(Number.isFinite(timestampMs), 'AGENT_AUTH_INVALID', 'Request timestamp is invalid.', 401);
    const skew = Math.abs(this.clock().getTime() - timestampMs);
    invariant(skew <= this.maximumSkewMs, 'REQUEST_EXPIRED', 'Signed request is outside the permitted time window.', 401);

    const agent = this.service.projection.agents.get(agentId);
    invariant(agent && !agent.revoked_at, 'AGENT_AUTH_INVALID', 'Agent identity is unknown or revoked.', 401);
    const actualBodyHash = createHash('sha256').update(bodyBytes).digest('hex');
    invariant(safeEqual(suppliedBodyHash, actualBodyHash), 'BODY_HASH_MISMATCH', 'Signed body hash does not match request bytes.', 401);
    const message = `${method.toUpperCase()}\n${url}\n${new Date(timestampMs).toISOString()}\n${nonce}\n${actualBodyHash}`;
    const valid = verify(null, Buffer.from(message), agent.public_key_pem, Buffer.from(signatureBase64, 'base64'));
    invariant(valid, 'AGENT_SIGNATURE_INVALID', 'Agent request signature is invalid.', 401);
    await this.nonceStore.consume(agentId, nonce, timestampMs + this.maximumSkewMs);
    return { type: 'agent', id: agentId, operator_id: agent.operator_id };
  }
}

export function signableRequest({ method, url, timestamp, nonce, bodyBytes }) {
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex');
  return {
    bodyHash,
    message: `${method.toUpperCase()}\n${url}\n${new Date(timestamp).toISOString()}\n${nonce}\n${bodyHash}`
  };
}
