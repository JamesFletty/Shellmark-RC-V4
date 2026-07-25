import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.mjs';
import { invariant } from './errors.mjs';
import { newId } from './ids.mjs';
import { formatCreditAmount, parseCreditAmount } from './money.mjs';
import { cloneSerializable, requireIsoDate, requireString } from './marketplace-base.mjs';
import { MarketplaceIdentityService } from './marketplace-identity-service.mjs';
import { assertTransition, JOB_STATUS } from './state-machine.mjs';

export class MarketplaceJobService extends MarketplaceIdentityService {
  async createJob(posterAgentId, spec) {
    const poster = this._requireActiveAgent(posterAgentId);
    invariant(spec && typeof spec === 'object', 'INVALID_INPUT', 'Job specification is required.');
    requireString(spec.title, 'title', 5);
    requireString(spec.category, 'category', 2);
    invariant(Array.isArray(spec.requirements) && spec.requirements.length > 0, 'INVALID_INPUT', 'At least one requirement is required.');
    invariant(Array.isArray(spec.deliverables) && spec.deliverables.length > 0, 'INVALID_INPUT', 'At least one deliverable is required.');
    invariant(Array.isArray(spec.acceptance_criteria) && spec.acceptance_criteria.length > 0, 'INVALID_INPUT', 'At least one acceptance criterion is required.');
    invariant(spec.payment?.asset === 'USDC' || spec.payment?.asset === 'TEST_CREDIT', 'INVALID_INPUT', 'Phase 0 jobs must be denominated in USDC or TEST_CREDIT.');
    const rewardUnits = parseCreditAmount(spec.payment.amount);
    const applicationDeadline = requireIsoDate(spec.deadlines?.application_deadline, 'deadlines.application_deadline');
    const submissionDeadline = requireIsoDate(spec.deadlines?.submission_deadline, 'deadlines.submission_deadline');
    invariant(Date.parse(applicationDeadline) < Date.parse(submissionDeadline), 'INVALID_INPUT', 'Application deadline must precede submission deadline.');

    const jobId = spec.job_id ?? newId('job');
    invariant(!this._projection.jobs.has(jobId), 'JOB_EXISTS', 'A job with this ID already exists.', 409);
    const normalizedSpec = cloneSerializable({
      ...spec,
      job_id: jobId,
      version: spec.version ?? 1,
      poster_agent_id: posterAgentId,
      payment: { ...spec.payment, asset: 'TEST_CREDIT' },
      deadlines: { ...spec.deadlines, application_deadline: applicationDeadline, submission_deadline: submissionDeadline }
    });
    const termsHash = createHash('sha256').update(canonicalJson(normalizedSpec)).digest('hex');
    await this._append([
      this._input('job', jobId, 'job.created', 'agent', posterAgentId, {
        poster_agent_id: posterAgentId,
        poster_operator_id: poster.operator_id,
        spec: normalizedSpec,
        reward_units: rewardUnits.toString(),
        terms_hash: termsHash
      })
    ]);
    return this.getJob(jobId);
  }

  async fundJob(posterAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertPoster(job, posterAgentId);
    invariant(job.status === JOB_STATUS.DRAFT, 'INVALID_JOB_STATE', 'Only draft jobs can be funded.', 409);
    invariant(!job.funded, 'JOB_ALREADY_FUNDED', 'Job is already funded.', 409);
    const amount = BigInt(job.reward_units);
    const balance = this._projection.balances.get(job.poster_operator_id) ?? 0n;
    invariant(balance >= amount, 'INSUFFICIENT_CREDITS', 'Operator has insufficient test credits.', 409, {
      available: formatCreditAmount(balance),
      required: formatCreditAmount(amount)
    });
    await this._append([
      this._input('credit_account', job.poster_operator_id, 'credits.escrowed', 'agent', posterAgentId, {
        operator_id: job.poster_operator_id,
        job_id: jobId,
        amount_units: amount.toString()
      })
    ]);
    return this.getJob(jobId);
  }

  async openJob(posterAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertPoster(job, posterAgentId);
    invariant(job.funded, 'JOB_NOT_FUNDED', 'Job must be funded before opening.', 409);
    assertTransition(job.status, JOB_STATUS.OPEN);
    await this._append([this._input('job', jobId, 'job.opened', 'agent', posterAgentId, {})]);
    return this.getJob(jobId);
  }

  async submitApplication(workerAgentId, jobId, input) {
    const worker = this._requireActiveAgent(workerAgentId);
    const job = this._requireJob(jobId);
    invariant(job.status === JOB_STATUS.OPEN, 'JOB_NOT_OPEN', 'Job is not accepting applications.', 409);
    invariant(Date.parse(job.spec.deadlines.application_deadline) > this._clock().getTime(), 'APPLICATION_WINDOW_CLOSED', 'Application deadline has passed.', 409);
    invariant(workerAgentId !== job.poster_agent_id, 'SELF_APPLICATION', 'The posting agent cannot apply to its own job.', 409);
    invariant(!job.applications.some((id) => this._projection.applications.get(id)?.worker_agent_id === workerAgentId), 'DUPLICATE_APPLICATION', 'Agent has already applied to this job.', 409);
    const applicationId = newId('app');
    await this._append([
      this._input('application', applicationId, 'application.submitted', 'agent', workerAgentId, {
        job_id: jobId,
        job_version: job.spec.version,
        worker_agent_id: workerAgentId,
        worker_operator_id: worker.operator_id,
        bid_amount: input?.bid_amount ?? job.spec.payment.amount,
        estimated_completion_seconds: input?.estimated_completion_seconds ?? null,
        capability_evidence: cloneSerializable(input?.capability_evidence ?? []),
        exceptions: cloneSerializable(input?.exceptions ?? [])
      })
    ]);
    return this.getApplication(applicationId);
  }

  async assignWorker(posterAgentId, jobId, applicationId) {
    const job = this._requireJob(jobId);
    this._assertPoster(job, posterAgentId);
    invariant(job.status === JOB_STATUS.OPEN, 'INVALID_JOB_STATE', 'Only open jobs can be assigned.', 409);
    const application = this._projection.applications.get(applicationId);
    invariant(application?.job_id === jobId, 'APPLICATION_NOT_FOUND', 'Application does not belong to this job.', 404);
    const relatedParty = this._projection.areOperatorsRelated(job.poster_operator_id, application.worker_operator_id);
    await this._append([
      this._input('job', jobId, 'job.assigned', 'agent', posterAgentId, {
        application_id: applicationId,
        worker_agent_id: application.worker_agent_id,
        worker_operator_id: application.worker_operator_id,
        related_party: relatedParty
      })
    ]);
    return this.getJob(jobId);
  }

  async acceptAssignment(workerAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertWorker(job, workerAgentId);
    invariant(job.status === JOB_STATUS.ASSIGNED, 'INVALID_JOB_STATE', 'Job is not awaiting assignment acceptance.', 409);
    invariant(!job.assignment_accepted, 'ASSIGNMENT_ALREADY_ACCEPTED', 'Assignment has already been accepted.', 409);
    await this._append([this._input('job', jobId, 'assignment.accepted', 'agent', workerAgentId, {})]);
    return this.getJob(jobId);
  }

  async startJob(workerAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertWorker(job, workerAgentId);
    invariant(job.assignment_accepted, 'ASSIGNMENT_NOT_ACCEPTED', 'Worker must accept the assignment before starting.', 409);
    assertTransition(job.status, JOB_STATUS.IN_PROGRESS);
    await this._append([this._input('job', jobId, 'job.started', 'agent', workerAgentId, {})]);
    return this.getJob(jobId);
  }
}
