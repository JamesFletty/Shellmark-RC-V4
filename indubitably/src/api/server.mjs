import { createServer } from 'node:http';
import { asHttpError } from '../domain/marketplace-service.mjs';
import { Router } from './router.mjs';

async function readBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0) return { bytes, value: {} };
  const contentType = String(request.headers['content-type'] ?? 'application/json');
  if (!contentType.includes('application/json')) {
    const error = new Error('Only application/json is supported.');
    error.statusCode = 415;
    throw error;
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    const error = new Error('Request body is not valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function send(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store'
  });
  response.end(payload);
}

export function createApiServer({ service, authenticator, validators, signer, maximumBodyBytes = 12 * 1024 * 1024 }) {
  const router = new Router();

  router.add('GET', '/health', { auth: 'none' }, async () => ({ status: 'ok', phase: 0 }));
  router.add('GET', '/v1/platform/public-key', { auth: 'none' }, async () => ({ algorithm: 'Ed25519', public_key_pem: signer.exportPublicKeyPem() }));

  router.add('POST', '/v1/admin/operators', { auth: 'admin' }, async ({ body }) => service.registerOperator(body));
  router.add('POST', '/v1/admin/operators/link', { auth: 'admin' }, async ({ body }) => service.linkOperators(body.left_operator_id, body.right_operator_id, body.reason));
  router.add('POST', '/v1/admin/agents', { auth: 'admin' }, async ({ body }) => service.registerAgent(body));
  router.add('POST', '/v1/admin/agents/:agentId/revoke', { auth: 'admin' }, async ({ params }) => service.revokeAgent(params.agentId));
  router.add('POST', '/v1/admin/credits/issue', { auth: 'admin' }, async ({ body }) => service.issueCredits(body.operator_id, body.amount, body.memo));
  router.add('POST', '/v1/admin/jobs/:jobId/verifications', { auth: 'admin' }, async ({ params, body }) => service.recordVerification({ type: 'admin', id: 'admin' }, params.jobId, body));
  router.add('POST', '/v1/admin/jobs/:jobId/verifications/run', { auth: 'admin' }, async ({ params, body }) => {
    const artifact = body.artifact_id ? service.getArtifact(body.artifact_id) : undefined;
    const result = await validators.run(body.validator_id, { artifact, config: body.config ?? {} });
    return service.recordVerification({ type: 'validator', id: body.validator_id }, params.jobId, {
      ...result,
      submission_id: body.submission_id
    });
  });
  router.add('GET', '/v1/admin/validators', { auth: 'admin' }, async () => ({ validators: validators.list() }));
  router.add('POST', '/v1/admin/disputes/:disputeId/resolve', { auth: 'admin' }, async ({ params, body }) => service.resolveDispute(params.disputeId, body));
  router.add('POST', '/v1/admin/timeouts/run', { auth: 'admin' }, async () => ({ actions: await service.runTimeouts() }));
  router.add('GET', '/v1/admin/metrics', { auth: 'admin' }, async () => service.getMetrics());

  router.add('GET', '/v1/jobs', { auth: 'agent' }, async ({ query }) => ({ jobs: service.listJobs({ status: query.get('status'), category: query.get('category'), capability: query.get('capability') }) }));
  router.add('POST', '/v1/jobs', { auth: 'agent' }, async ({ actor, body }) => service.createJob(actor.id, body));
  router.add('GET', '/v1/jobs/:jobId', { auth: 'agent' }, async ({ params }) => service.getJob(params.jobId));
  router.add('POST', '/v1/jobs/:jobId/fund', { auth: 'agent' }, async ({ actor, params }) => service.fundJob(actor.id, params.jobId));
  router.add('POST', '/v1/jobs/:jobId/open', { auth: 'agent' }, async ({ actor, params }) => service.openJob(actor.id, params.jobId));
  router.add('POST', '/v1/jobs/:jobId/applications', { auth: 'agent' }, async ({ actor, params, body }) => service.submitApplication(actor.id, params.jobId, body));
  router.add('POST', '/v1/jobs/:jobId/assign', { auth: 'agent' }, async ({ actor, params, body }) => service.assignWorker(actor.id, params.jobId, body.application_id));
  router.add('POST', '/v1/jobs/:jobId/accept', { auth: 'agent' }, async ({ actor, params }) => service.acceptAssignment(actor.id, params.jobId));
  router.add('POST', '/v1/jobs/:jobId/start', { auth: 'agent' }, async ({ actor, params }) => service.startJob(actor.id, params.jobId));
  router.add('POST', '/v1/jobs/:jobId/artifacts', { auth: 'agent' }, async ({ actor, params, body }) => service.storeArtifact(actor.id, params.jobId, body));
  router.add('POST', '/v1/jobs/:jobId/submissions', { auth: 'agent' }, async ({ actor, params, body }) => service.submitWork(actor.id, params.jobId, body));
  router.add('POST', '/v1/jobs/:jobId/approve', { auth: 'agent' }, async ({ actor, params }) => service.approveJob(actor.id, params.jobId));
  router.add('POST', '/v1/jobs/:jobId/disputes', { auth: 'agent' }, async ({ actor, params, body }) => service.openDispute(actor.id, params.jobId, body));
  router.add('POST', '/v1/jobs/:jobId/cancel', { auth: 'agent' }, async ({ actor, params }) => service.cancelJob(actor.id, params.jobId));
  router.add('GET', '/v1/jobs/:jobId/receipt', { auth: 'agent' }, async ({ params }) => service.getReceipt(params.jobId));
  router.add('GET', '/v1/operators/:operatorId/balance', { auth: 'agent' }, async ({ actor, params }) => {
    if (actor.operator_id !== params.operatorId) {
      const error = new Error('Agents may only retrieve their own operator balance.');
      error.statusCode = 403;
      throw error;
    }
    return service.getBalance(params.operatorId);
  });
  router.add('GET', '/v1/events', { auth: 'agent' }, async ({ query }) => ({ events: service.getEvents({ aggregate_type: query.get('aggregate_type'), aggregate_id: query.get('aggregate_id'), after: query.get('after') }) }));

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const route = router.match(request.method, requestUrl.pathname);
    if (!route) {
      send(response, 404, { error: { code: 'ROUTE_NOT_FOUND', message: 'Route was not found.' } });
      return;
    }
    try {
      const { bytes, value } = await readBody(request, maximumBodyBytes);
      let actor = { type: 'anonymous', id: 'anonymous' };
      if (route.options.auth === 'admin') actor = authenticator.requireAdmin(request.headers);
      if (route.options.auth === 'agent') {
        actor = await authenticator.requireAgent({ method: request.method, url: request.url, headers: request.headers, bodyBytes: bytes });
      }
      const result = await route.handler({ actor, params: route.params, query: requestUrl.searchParams, body: value, request });
      send(response, 200, { data: result });
    } catch (error) {
      if (error.statusCode && !(error.code && error.statusCode)) {
        send(response, error.statusCode, { error: { code: 'REQUEST_ERROR', message: error.message } });
        return;
      }
      const httpError = asHttpError(error);
      if (httpError.statusCode === 500) console.error(error);
      send(response, httpError.statusCode, httpError.body);
    }
  });
}
