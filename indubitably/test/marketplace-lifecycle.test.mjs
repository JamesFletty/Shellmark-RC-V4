import assert from 'node:assert/strict';
import test from 'node:test';
import { agentKeys, jobSpec, testContext } from './helpers.mjs';

async function registerParty(service, name) {
  const operator = await service.registerOperator({ display_name: `${name} Operator` });
  const keys = agentKeys();
  const agent = await service.registerAgent({
    operator_id: operator.operator_id,
    display_name: `${name} Agent`,
    public_key_pem: keys.publicKeyPem,
    capabilities: [{ id: 'data.json.validation', version: '1' }]
  });
  return { operator, agent, keys };
}

test('completes a funded agent-to-agent job and issues a signed receipt', async () => {
  const { service, signer } = await testContext();
  const poster = await registerParty(service, 'Poster');
  const worker = await registerParty(service, 'Worker');
  await service.issueCredits(poster.operator.operator_id, '100.00', 'Pilot allocation');

  const job = await service.createJob(poster.agent.agent_id, jobSpec({ posterAgentId: poster.agent.agent_id }));
  await service.fundJob(poster.agent.agent_id, job.job_id);
  await service.openJob(poster.agent.agent_id, job.job_id);
  const application = await service.submitApplication(worker.agent.agent_id, job.job_id, { estimated_completion_seconds: 900 });
  await service.assignWorker(poster.agent.agent_id, job.job_id, application.application_id);
  await service.acceptAssignment(worker.agent.agent_id, job.job_id);
  await service.startJob(worker.agent.agent_id, job.job_id);

  const artifact = await service.storeArtifact(worker.agent.agent_id, job.job_id, {
    name: 'result.json',
    media_type: 'application/json',
    content_base64: Buffer.from(JSON.stringify({ status: 'ok' })).toString('base64')
  });
  const submission = await service.submitWork(worker.agent.agent_id, job.job_id, {
    artifact_ids: [artifact.artifact_id],
    criterion_evidence: [{ criterion_id: 'status-ok', artifact_id: artifact.artifact_id }]
  });
  await service.recordVerification({ type: 'validator', id: 'json-artifact-v1' }, job.job_id, {
    submission_id: submission.submission_id,
    verification_type: 'deterministic',
    validator_ref: 'json-artifact-v1',
    aggregate_result: 'accepted',
    confidence: 1,
    results: [{ criterion_id: 'status-ok', status: 'passed' }]
  });
  const settlement = await service.approveJob(poster.agent.agent_id, job.job_id);

  assert.equal(settlement.job.status, 'COMPLETED');
  assert.equal(settlement.job.escrow_balance, '0');
  assert.equal(service.getBalance(poster.operator.operator_id).balance, '50');
  assert.equal(service.getBalance(worker.operator.operator_id).balance, '50');
  assert.equal(settlement.receipt.outcome, 'completed');
  assert.equal(signer.verifyReceipt(settlement.receipt), true);
  assert.equal(service.getMetrics().jobs_completed, 1);
});

test('rejects invalid transitions and insufficient funding', async () => {
  const { service } = await testContext();
  const poster = await registerParty(service, 'Poster');
  const job = await service.createJob(poster.agent.agent_id, jobSpec({ posterAgentId: poster.agent.agent_id }));

  await assert.rejects(() => service.openJob(poster.agent.agent_id, job.job_id), (error) => error.code === 'JOB_NOT_FUNDED');
  await assert.rejects(() => service.fundJob(poster.agent.agent_id, job.job_id), (error) => error.code === 'INSUFFICIENT_CREDITS');
});

test('labels related-party work and excludes it from independent activity', async () => {
  const { service } = await testContext();
  const poster = await registerParty(service, 'Poster');
  const worker = await registerParty(service, 'Worker');
  await service.linkOperators(poster.operator.operator_id, worker.operator.operator_id, 'Common beneficial owner');
  await service.issueCredits(poster.operator.operator_id, '50', 'Pilot allocation');
  const job = await service.createJob(poster.agent.agent_id, jobSpec({ posterAgentId: poster.agent.agent_id }));
  await service.fundJob(poster.agent.agent_id, job.job_id);
  await service.openJob(poster.agent.agent_id, job.job_id);
  const application = await service.submitApplication(worker.agent.agent_id, job.job_id, {});
  const assigned = await service.assignWorker(poster.agent.agent_id, job.job_id, application.application_id);
  assert.equal(assigned.related_party, true);
});

test('expires open jobs and refunds escrow after the application deadline', async () => {
  const context = await testContext();
  const poster = await registerParty(context.service, 'Poster');
  await context.service.issueCredits(poster.operator.operator_id, '50', 'Pilot allocation');
  const job = await context.service.createJob(poster.agent.agent_id, jobSpec({ posterAgentId: poster.agent.agent_id, applicationDeadline: '2026-07-25T13:00:00Z' }));
  await context.service.fundJob(poster.agent.agent_id, job.job_id);
  await context.service.openJob(poster.agent.agent_id, job.job_id);
  context.setNow('2026-07-25T14:00:00Z');
  const actions = await context.service.runTimeouts();
  assert.equal(actions.length, 1);
  assert.equal(context.service.getJob(job.job_id).status, 'EXPIRED');
  assert.equal(context.service.getBalance(poster.operator.operator_id).balance, '50');
});
