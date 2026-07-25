import { JOB_STATUS } from './state-machine.mjs';

function relationKey(left, right) {
  return [left, right].sort().join(':');
}

export class MarketplaceProjection {
  versions = new Map();
  operators = new Map();
  agents = new Map();
  jobs = new Map();
  applications = new Map();
  artifacts = new Map();
  submissions = new Map();
  verifications = new Map();
  disputes = new Map();
  receipts = new Map();
  balances = new Map();
  escrows = new Map();
  relatedOperators = new Set();
  events = [];

  static fromEvents(events) {
    const projection = new MarketplaceProjection();
    for (const event of events) projection.apply(event);
    return projection;
  }

  version(type, id) {
    return this.versions.get(`${type}:${id}`) ?? 0;
  }

  areOperatorsRelated(left, right) {
    return left === right || this.relatedOperators.has(relationKey(left, right));
  }

  apply(event) {
    this.events.push(event);
    this.versions.set(`${event.aggregate_type}:${event.aggregate_id}`, event.aggregate_version);
    const p = event.payload;

    switch (event.event_type) {
      case 'operator.registered':
        this.operators.set(event.aggregate_id, { ...p, operator_id: event.aggregate_id, created_at: event.occurred_at });
        this.balances.set(event.aggregate_id, 0n);
        break;
      case 'operators.related':
        this.relatedOperators.add(relationKey(p.left_operator_id, p.right_operator_id));
        break;
      case 'agent.registered':
        this.agents.set(event.aggregate_id, { ...p, agent_id: event.aggregate_id, created_at: event.occurred_at, revoked_at: null });
        break;
      case 'agent.revoked': {
        const agent = this.agents.get(event.aggregate_id);
        if (agent) agent.revoked_at = event.occurred_at;
        break;
      }
      case 'credits.issued':
        this.balances.set(p.operator_id, (this.balances.get(p.operator_id) ?? 0n) + BigInt(p.amount_units));
        break;
      case 'job.created':
        this.jobs.set(event.aggregate_id, {
          ...p,
          job_id: event.aggregate_id,
          status: JOB_STATUS.DRAFT,
          funded: false,
          assignment_accepted: false,
          applications: [],
          submission_ids: [],
          verification_ids: [],
          created_at: event.occurred_at,
          updated_at: event.occurred_at
        });
        break;
      case 'credits.escrowed':
        this.balances.set(p.operator_id, (this.balances.get(p.operator_id) ?? 0n) - BigInt(p.amount_units));
        this.escrows.set(p.job_id, (this.escrows.get(p.job_id) ?? 0n) + BigInt(p.amount_units));
        this.jobs.get(p.job_id).funded = true;
        break;
      case 'job.opened':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.OPEN, event.occurred_at);
        break;
      case 'application.submitted':
        this.applications.set(event.aggregate_id, { ...p, application_id: event.aggregate_id, created_at: event.occurred_at });
        this.jobs.get(p.job_id).applications.push(event.aggregate_id);
        break;
      case 'job.assigned': {
        const job = this.jobs.get(event.aggregate_id);
        job.status = JOB_STATUS.ASSIGNED;
        job.worker_agent_id = p.worker_agent_id;
        job.application_id = p.application_id;
        job.assignment_accepted = false;
        job.related_party = p.related_party;
        job.updated_at = event.occurred_at;
        break;
      }
      case 'assignment.accepted': {
        const job = this.jobs.get(event.aggregate_id);
        job.assignment_accepted = true;
        job.assignment_accepted_at = event.occurred_at;
        job.updated_at = event.occurred_at;
        break;
      }
      case 'assignment.timed_out': {
        const job = this.jobs.get(event.aggregate_id);
        job.status = JOB_STATUS.OPEN;
        job.worker_agent_id = null;
        job.application_id = null;
        job.assignment_accepted = false;
        job.assignment_accepted_at = null;
        job.updated_at = event.occurred_at;
        break;
      }
      case 'job.started':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.IN_PROGRESS, event.occurred_at);
        break;
      case 'artifact.stored':
        this.artifacts.set(event.aggregate_id, { ...p, artifact_id: event.aggregate_id, created_at: event.occurred_at });
        break;
      case 'submission.created': {
        this.submissions.set(event.aggregate_id, { ...p, submission_id: event.aggregate_id, created_at: event.occurred_at });
        const job = this.jobs.get(p.job_id);
        job.submission_ids.push(event.aggregate_id);
        job.latest_submission_id = event.aggregate_id;
        job.status = JOB_STATUS.SUBMITTED;
        job.updated_at = event.occurred_at;
        break;
      }
      case 'verification.recorded': {
        this.verifications.set(event.aggregate_id, { ...p, verification_id: event.aggregate_id, created_at: event.occurred_at });
        const job = this.jobs.get(p.job_id);
        job.verification_ids.push(event.aggregate_id);
        job.latest_verification_id = event.aggregate_id;
        job.status = JOB_STATUS.UNDER_VERIFICATION;
        job.updated_at = event.occurred_at;
        break;
      }
      case 'dispute.opened':
        this.disputes.set(event.aggregate_id, { ...p, dispute_id: event.aggregate_id, status: 'OPEN', created_at: event.occurred_at });
        this.#setJobStatus(p.job_id, JOB_STATUS.DISPUTED, event.occurred_at);
        break;
      case 'dispute.resolved': {
        const dispute = this.disputes.get(event.aggregate_id);
        Object.assign(dispute, { ...p, status: 'RESOLVED', resolved_at: event.occurred_at });
        break;
      }
      case 'credits.released':
        this.escrows.set(p.job_id, (this.escrows.get(p.job_id) ?? 0n) - BigInt(p.amount_units));
        this.balances.set(p.operator_id, (this.balances.get(p.operator_id) ?? 0n) + BigInt(p.amount_units));
        break;
      case 'credits.refunded':
        this.escrows.set(p.job_id, (this.escrows.get(p.job_id) ?? 0n) - BigInt(p.amount_units));
        this.balances.set(p.operator_id, (this.balances.get(p.operator_id) ?? 0n) + BigInt(p.amount_units));
        break;
      case 'job.completed':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.COMPLETED, event.occurred_at);
        break;
      case 'job.refunded':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.REFUNDED, event.occurred_at);
        break;
      case 'job.cancelled':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.CANCELLED, event.occurred_at);
        break;
      case 'job.expired':
        this.#setJobStatus(event.aggregate_id, JOB_STATUS.EXPIRED, event.occurred_at);
        break;
      case 'receipt.issued':
        this.receipts.set(p.job_id, p.receipt);
        break;
      default:
        break;
    }
  }

  #setJobStatus(jobId, status, occurredAt) {
    const job = this.jobs.get(jobId);
    job.status = status;
    job.updated_at = occurredAt;
  }
}
