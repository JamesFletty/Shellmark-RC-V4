import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileEventStore } from '../src/infrastructure/event-store.mjs';
import { MemoryArtifactStore } from '../src/infrastructure/artifact-store.mjs';
import { MarketplaceService } from '../src/domain/marketplace-service.mjs';
import { PlatformSigner } from '../src/domain/receipts.mjs';
import { agentKeys, jobSpec, testContext } from './helpers.mjs';

async function registerParty(service, name) {
  const operator = await service.registerOperator({ display_name: `${name} Operator` });
  const keys = agentKeys();
  const agent = await service.registerAgent({ operator_id: operator.operator_id, display_name: `${name} Agent`, public_key_pem: keys.publicKeyPem });
  return { operator, agent };
}

async function jobUnderVerification(service, poster, worker) {
  await service.issueCredits(poster.operator.operator_id, '50', 'Pilot allocation');
  const job = await service.createJob(poster.agent.agent_id, jobSpec({ posterAgentId: poster.agent.agent_id }));
  await service.fundJob(poster.agent.agent_id, job.job_id);
  await service.openJob(poster.agent.agent_id, job.job_id);
  const application = await service.submitApplication(worker.agent.agent_id, job.job_id, {});
  await service.assignWorker(poster.agent.agent_id, job.job_id, application.application_id);
  await service.acceptAssignment(worker.agent.agent_id, job.job_id);
  await service.startJob(worker.agent.agent_id, job.job_id);
  const artifact = await service.storeArtifact(worker.agent.agent_id, job.job_id, {
    name: 'result.json',
    media_type: 'application/json',
    content_base64: Buffer.from('{"status":"ok"}').toString('base64')
  });
  const submission = await service.submitWork(worker.agent.agent_id, job.job_id, { artifact_ids: [artifact.artifact_id] });
  await service.recordVerification({ type: 'validator', id: 'json-artifact-v1' }, job.job_id, {
    submission_id: submission.submission_id,
    aggregate_result: 'accepted',
    results: [{ criterion_id: 'status-ok', status: 'passed' }]
  });
  return job;
}

test('rebuilds marketplace state from a persisted hash-chained event log', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'indubitably-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'events.ndjson');
  const clock = () => new Date('2026-07-25T12:00:00Z');
  const signer = PlatformSigner.ephemeral();
  const first = await new MarketplaceService({
    eventStore: new FileEventStore(path, { clock }),
    artifactStore: new MemoryArtifactStore(),
    signer,
    clock
  }).initialize();
  const operator = await first.registerOperator({ display_name: 'Persistent Operator' });
  await first.issueCredits(operator.operator_id, '25.50', 'Pilot allocation');

  const second = await new MarketplaceService({
    eventStore: new FileEventStore(path, { clock }),
    artifactStore: new MemoryArtifactStore(),
    signer,
    clock
  }).initialize();
  assert.equal(second.getBalance(operator.operator_id).balance, '25.5');
  assert.equal(second.getMetrics().operators, 1);
});

test('resolves a dispute with a partial worker award atomically', async () => {
  const { service } = await testContext();
  const poster = await registerParty(service, 'Poster');
  const worker = await registerParty(service, 'Worker');
  const job = await jobUnderVerification(service, poster, worker);
  const dispute = await service.openDispute(worker.agent.agent_id, job.job_id, { reason: 'The accepted verification should be honored.' });
  const settlement = await service.resolveDispute(dispute.dispute_id, { worker_award: '30', rationale: 'Partial award reflects accepted output and a documentation omission.' });

  assert.equal(settlement.job.status, 'COMPLETED');
  assert.equal(service.getBalance(worker.operator.operator_id).balance, '30');
  assert.equal(service.getBalance(poster.operator.operator_id).balance, '20');
  assert.equal(service.getDispute(dispute.dispute_id).status, 'RESOLVED');
  assert.equal(settlement.receipt.worker_award, '30');
  assert.equal(settlement.receipt.poster_refund, '20');
});

test('allows a zero worker award and full refund', async () => {
  const { service } = await testContext();
  const poster = await registerParty(service, 'Poster');
  const worker = await registerParty(service, 'Worker');
  const job = await jobUnderVerification(service, poster, worker);
  const dispute = await service.openDispute(poster.agent.agent_id, job.job_id, { reason: 'The submitted artifact was linked to the wrong source data.' });
  const settlement = await service.resolveDispute(dispute.dispute_id, { worker_award: '0', rationale: 'Evidence establishes that the deliverable used the wrong source dataset.' });

  assert.equal(settlement.job.status, 'REFUNDED');
  assert.equal(service.getBalance(worker.operator.operator_id).balance, '0');
  assert.equal(service.getBalance(poster.operator.operator_id).balance, '50');
});
