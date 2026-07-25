import { DomainError, invariant } from './errors.mjs';
import { formatCreditAmount } from './money.mjs';
import { MarketplaceProjection } from './projection.mjs';
import { JOB_STATUS } from './state-machine.mjs';

export function requireString(value, field, minLength = 1) {
  invariant(typeof value === 'string' && value.trim().length >= minLength, 'INVALID_INPUT', `${field} is required.`);
  return value.trim();
}

export function requireIsoDate(value, field) {
  requireString(value, field);
  const time = Date.parse(value);
  invariant(Number.isFinite(time), 'INVALID_INPUT', `${field} must be an ISO-8601 date-time.`);
  return new Date(time).toISOString();
}

export function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export class MarketplaceBase {
  _eventStore;
  _artifactStore;
  _signer;
  _clock;
  _projection = new MarketplaceProjection();

  constructor({ eventStore, artifactStore, signer, clock = () => new Date() }) {
    this._eventStore = eventStore;
    this._artifactStore = artifactStore;
    this._signer = signer;
    this._clock = clock;
  }

  async initialize() {
    this._projection = MarketplaceProjection.fromEvents(await this._eventStore.readAll());
    return this;
  }

  get projection() {
    return this._projection;
  }

  listJobs({ status, category, capability } = {}) {
    return [...this._projection.jobs.values()]
      .filter((job) => !status || job.status === status)
      .filter((job) => !category || job.spec.category === category)
      .filter((job) => !capability || (job.spec.required_capabilities ?? []).some((item) => item.capability_id === capability))
      .map((job) => this._serializeJob(job));
  }

  getJob(jobId) {
    return this._serializeJob(this._requireJob(jobId));
  }

  getOperator(operatorId) {
    const operator = this._requireOperator(operatorId);
    return { ...cloneSerializable(operator), balance: this.getBalance(operatorId).balance };
  }

  getAgent(agentId) {
    return cloneSerializable(this._requireAgent(agentId));
  }

  getApplication(applicationId) {
    const value = this._projection.applications.get(applicationId);
    invariant(value, 'APPLICATION_NOT_FOUND', 'Application was not found.', 404);
    return cloneSerializable(value);
  }

  getArtifact(artifactId) {
    const value = this._projection.artifacts.get(artifactId);
    invariant(value, 'ARTIFACT_NOT_FOUND', 'Artifact was not found.', 404);
    return cloneSerializable(value);
  }

  getSubmission(submissionId) {
    const value = this._projection.submissions.get(submissionId);
    invariant(value, 'SUBMISSION_NOT_FOUND', 'Submission was not found.', 404);
    return cloneSerializable(value);
  }

  getVerification(verificationId) {
    const value = this._projection.verifications.get(verificationId);
    invariant(value, 'VERIFICATION_NOT_FOUND', 'Verification was not found.', 404);
    return cloneSerializable(value);
  }

  getDispute(disputeId) {
    const value = this._projection.disputes.get(disputeId);
    invariant(value, 'DISPUTE_NOT_FOUND', 'Dispute was not found.', 404);
    return cloneSerializable(value);
  }

  getReceipt(jobId) {
    const receipt = this._projection.receipts.get(jobId);
    invariant(receipt, 'RECEIPT_NOT_FOUND', 'Completion receipt was not found.', 404);
    return cloneSerializable(receipt);
  }

  getBalance(operatorId) {
    this._requireOperator(operatorId);
    return { operator_id: operatorId, balance: formatCreditAmount(this._projection.balances.get(operatorId) ?? 0n), asset: 'TEST_CREDIT' };
  }

  getEvents({ aggregate_type, aggregate_id, after } = {}) {
    return this._projection.events
      .filter((event) => !aggregate_type || event.aggregate_type === aggregate_type)
      .filter((event) => !aggregate_id || event.aggregate_id === aggregate_id)
      .filter((event) => !after || Date.parse(event.occurred_at) > Date.parse(after))
      .map(cloneSerializable);
  }

  getMetrics() {
    const jobs = [...this._projection.jobs.values()];
    const completed = jobs.filter((job) => job.status === JOB_STATUS.COMPLETED);
    const disputed = jobs.filter((job) => job.status === JOB_STATUS.DISPUTED || [...this._projection.disputes.values()].some((d) => d.job_id === job.job_id));
    const relatedCompleted = completed.filter((job) => job.related_party);
    const posterOperators = new Set(jobs.map((job) => job.poster_operator_id));
    const repeatPosters = [...posterOperators].filter((operatorId) => jobs.filter((job) => job.poster_operator_id === operatorId).length > 1);
    const totalEscrow = [...this._projection.escrows.values()].reduce((sum, value) => sum + value, 0n);
    return {
      operators: this._projection.operators.size,
      agents: this._projection.agents.size,
      jobs_posted: jobs.length,
      jobs_completed: completed.length,
      open_disputes: [...this._projection.disputes.values()].filter((d) => d.status === 'OPEN').length,
      dispute_rate: jobs.length ? disputed.length / jobs.length : 0,
      repeat_poster_count: repeatPosters.length,
      related_party_completed_share: completed.length ? relatedCompleted.length / completed.length : 0,
      escrow_balance: formatCreditAmount(totalEscrow),
      asset: 'TEST_CREDIT'
    };
  }

  async _settleJob({ job, workerAwardUnits, refundUnits, actorType, actorId, outcome, disputeId = null, prefixEvents = [] }) {
    const worker = this._requireAgent(job.worker_agent_id);
    const escrow = this._projection.escrows.get(job.job_id) ?? 0n;
    invariant(workerAwardUnits + refundUnits === escrow, 'SETTLEMENT_MISMATCH', 'Settlement must consume the full escrow.', 500);
    const events = [...prefixEvents];
    if (workerAwardUnits > 0n) {
      events.push(this._input('credit_account', worker.operator_id, 'credits.released', actorType, actorId, {
        operator_id: worker.operator_id,
        job_id: job.job_id,
        amount_units: workerAwardUnits.toString()
      }));
    }
    if (refundUnits > 0n) {
      events.push(this._input('credit_account', job.poster_operator_id, 'credits.refunded', actorType, actorId, {
        operator_id: job.poster_operator_id,
        job_id: job.job_id,
        amount_units: refundUnits.toString()
      }));
    }
    events.push(this._input('job', job.job_id, outcome === 'completed' ? 'job.completed' : 'job.refunded', actorType, actorId, { dispute_id: disputeId }));
    const receiptBase = {
      receipt_version: '1',
      job_id: job.job_id,
      terms_hash: job.terms_hash,
      submission_id: job.latest_submission_id ?? null,
      verification_id: job.latest_verification_id ?? null,
      outcome,
      worker_award: formatCreditAmount(workerAwardUnits),
      poster_refund: formatCreditAmount(refundUnits),
      asset: 'TEST_CREDIT',
      poster_agent_id: job.poster_agent_id,
      worker_agent_id: job.worker_agent_id,
      related_party: Boolean(job.related_party),
      completed_at: this._clock().toISOString()
    };
    const receipt = this._signer.signReceipt(receiptBase);
    events.push(this._input('receipt', job.job_id, 'receipt.issued', 'platform', 'indubitably-phase0', { job_id: job.job_id, receipt }));
    await this._append(events);
    return { job: this.getJob(job.job_id), receipt: this.getReceipt(job.job_id) };
  }

  _serializeJob(job) {
    return {
      ...cloneSerializable(job),
      reward: formatCreditAmount(BigInt(job.reward_units)),
      escrow_balance: formatCreditAmount(this._projection.escrows.get(job.job_id) ?? 0n),
      asset: 'TEST_CREDIT'
    };
  }

  _assertPoster(job, agentId) {
    invariant(job.poster_agent_id === agentId, 'FORBIDDEN', 'Only the posting agent may perform this action.', 403);
  }

  _assertWorker(job, agentId) {
    invariant(job.worker_agent_id === agentId, 'FORBIDDEN', 'Only the assigned worker may perform this action.', 403);
  }

  _requireOperator(operatorId) {
    const value = this._projection.operators.get(operatorId);
    invariant(value, 'OPERATOR_NOT_FOUND', 'Operator was not found.', 404);
    return value;
  }

  _requireAgent(agentId) {
    const value = this._projection.agents.get(agentId);
    invariant(value, 'AGENT_NOT_FOUND', 'Agent was not found.', 404);
    return value;
  }

  _requireActiveAgent(agentId) {
    const value = this._requireAgent(agentId);
    invariant(!value.revoked_at, 'AGENT_REVOKED', 'Agent credentials have been revoked.', 403);
    return value;
  }

  _requireJob(jobId) {
    const value = this._projection.jobs.get(jobId);
    invariant(value, 'JOB_NOT_FOUND', 'Job was not found.', 404);
    return value;
  }

  _input(aggregateType, aggregateId, eventType, actorType, actorId, payload) {
    return { aggregate_type: aggregateType, aggregate_id: aggregateId, event_type: eventType, actor_type: actorType, actor_id: actorId, payload };
  }

  async _append(inputs) {
    const localVersions = new Map();
    const versioned = inputs.map((input) => {
      const key = `${input.aggregate_type}:${input.aggregate_id}`;
      const current = localVersions.get(key) ?? this._projection.version(input.aggregate_type, input.aggregate_id);
      const aggregateVersion = current + 1;
      localVersions.set(key, aggregateVersion);
      return { ...input, aggregate_version: aggregateVersion };
    });
    const events = await this._eventStore.appendBatch(versioned);
    for (const event of events) this._projection.apply(event);
    return events;
  }
}

export function asHttpError(error) {
  if (error instanceof DomainError) {
    return { statusCode: error.statusCode, body: { error: { code: error.code, message: error.message, details: error.details } } };
  }
  return { statusCode: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected internal error.' } } };
}
