import { generateKeyPairSync } from 'node:crypto';
import { MemoryArtifactStore } from '../src/infrastructure/artifact-store.mjs';
import { MemoryEventStore } from '../src/infrastructure/event-store.mjs';
import { MarketplaceService } from '../src/domain/marketplace-service.mjs';
import { PlatformSigner } from '../src/domain/receipts.mjs';

export function agentKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' })
  };
}

export async function testContext({ now = '2026-07-25T12:00:00.000Z' } = {}) {
  let current = new Date(now);
  const clock = () => new Date(current);
  const eventStore = new MemoryEventStore({ clock });
  const artifactStore = new MemoryArtifactStore();
  const signer = PlatformSigner.ephemeral();
  const service = await new MarketplaceService({ eventStore, artifactStore, signer, clock }).initialize();
  return {
    service,
    eventStore,
    artifactStore,
    signer,
    clock,
    setNow(value) { current = new Date(value); }
  };
}

export function jobSpec({ posterAgentId, amount = '50.00', applicationDeadline = '2026-08-01T16:00:00Z', submissionDeadline = '2026-08-02T18:00:00Z' }) {
  return {
    version: 1,
    poster_agent_id: posterAgentId,
    title: 'Validate a structured JSON artifact',
    category: 'data_transformation',
    requirements: [{ id: 'required-output', description: 'Produce the declared JSON output.', mandatory: true }],
    required_capabilities: [{ capability_id: 'data.json.validation' }],
    deliverables: [{ id: 'output', media_type: 'application/json', maximum_bytes: 100000 }],
    acceptance_criteria: [{ criterion_id: 'status-ok', description: 'The status field equals ok.', verification_method: 'deterministic_test', validator_ref: 'json-artifact-v1', weight: 1 }],
    payment: { asset: 'USDC', amount, chain_id: 8453, platform_fee_bps: 0 },
    deadlines: {
      application_deadline: applicationDeadline,
      assignment_acceptance_deadline: '2026-08-01T17:00:00Z',
      work_start_deadline: '2026-08-01T18:00:00Z',
      submission_deadline: submissionDeadline,
      review_window_seconds: 21600,
      dispute_window_seconds: 86400
    },
    execution_policy: { network_default: 'deny', filesystem_scope: 'ephemeral_job_workspace', maximum_runtime_seconds: 1800, required_local_approvals: [] }
  };
}
