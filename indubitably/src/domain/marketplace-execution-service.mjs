import { invariant } from './errors.mjs';
import { newId } from './ids.mjs';
import { formatCreditAmount, parseNonnegativeCreditAmount } from './money.mjs';
import { cloneSerializable, requireString } from './marketplace-base.mjs';
import { MarketplaceJobService } from './marketplace-job-service.mjs';
import { assertTransition, JOB_STATUS } from './state-machine.mjs';

export class MarketplaceExecutionService extends MarketplaceJobService {
  async storeArtifact(agentId, jobId, input) {
    const agent = this._requireActiveAgent(agentId);
    const job = this._requireJob(jobId);
    invariant([job.poster_agent_id, job.worker_agent_id].includes(agentId), 'FORBIDDEN', 'Agent is not a party to this job.', 403);
    invariant([JOB_STATUS.IN_PROGRESS, JOB_STATUS.SUBMITTED, JOB_STATUS.UNDER_VERIFICATION, JOB_STATUS.DISPUTED].includes(job.status), 'INVALID_JOB_STATE', 'Artifacts cannot be added in the current job state.', 409);
    const stored = await this._artifactStore.putBase64({
      contentBase64: input.content_base64,
      expectedSha256: input.expected_sha256,
      mediaType: input.media_type
    });
    const artifactId = newId('art');
    await this._append([
      this._input('artifact', artifactId, 'artifact.stored', 'agent', agentId, {
        job_id: jobId,
        uploader_agent_id: agentId,
        uploader_operator_id: agent.operator_id,
        name: requireString(input.name, 'name', 1),
        ...stored
      })
    ]);
    return this.getArtifact(artifactId);
  }

  async submitWork(workerAgentId, jobId, input) {
    const job = this._requireJob(jobId);
    this._assertWorker(job, workerAgentId);
    assertTransition(job.status, JOB_STATUS.SUBMITTED);
    invariant(Date.parse(job.spec.deadlines.submission_deadline) >= this._clock().getTime(), 'SUBMISSION_DEADLINE_PASSED', 'Submission deadline has passed.', 409);
    invariant(Array.isArray(input.artifact_ids) && input.artifact_ids.length > 0, 'INVALID_INPUT', 'At least one artifact is required.');
    for (const artifactId of input.artifact_ids) {
      const artifact = this._projection.artifacts.get(artifactId);
      invariant(artifact?.job_id === jobId, 'ARTIFACT_NOT_FOUND', `Artifact ${artifactId} does not belong to this job.`, 404);
    }
    const submissionId = newId('sub');
    await this._append([
      this._input('submission', submissionId, 'submission.created', 'agent', workerAgentId, {
        job_id: jobId,
        job_version: job.spec.version,
        terms_hash: job.terms_hash,
        worker_agent_id: workerAgentId,
        artifact_ids: [...input.artifact_ids],
        criterion_evidence: cloneSerializable(input.criterion_evidence ?? []),
        notes: input.notes ?? null
      })
    ]);
    return this.getSubmission(submissionId);
  }

  async recordVerification(verifierActor, jobId, input) {
    const job = this._requireJob(jobId);
    invariant([JOB_STATUS.SUBMITTED, JOB_STATUS.UNDER_VERIFICATION].includes(job.status), 'INVALID_JOB_STATE', 'Job is not ready for verification.', 409);
    const submission = this._projection.submissions.get(input.submission_id ?? job.latest_submission_id);
    invariant(submission?.job_id === jobId, 'SUBMISSION_NOT_FOUND', 'Submission does not belong to this job.', 404);
    invariant(['accepted', 'rejected', 'needs_review'].includes(input.aggregate_result), 'INVALID_INPUT', 'aggregate_result must be accepted, rejected, or needs_review.');
    const verificationId = newId('ver');
    await this._append([
      this._input('verification', verificationId, 'verification.recorded', verifierActor.type, verifierActor.id, {
        job_id: jobId,
        submission_id: submission.submission_id,
        verifier_id: verifierActor.id,
        verification_type: input.verification_type ?? 'manual_phase0',
        validator_ref: input.validator_ref ?? null,
        results: cloneSerializable(input.results ?? []),
        aggregate_result: input.aggregate_result,
        confidence: input.confidence ?? null,
        evidence_hash: input.evidence_hash ?? null
      })
    ]);
    return this.getVerification(verificationId);
  }

  async approveJob(posterAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertPoster(job, posterAgentId);
    invariant(job.status === JOB_STATUS.UNDER_VERIFICATION, 'INVALID_JOB_STATE', 'Job is not under verification.', 409);
    const verification = this._projection.verifications.get(job.latest_verification_id);
    invariant(verification?.aggregate_result === 'accepted', 'VERIFICATION_NOT_ACCEPTED', 'Latest verification did not accept the work.', 409);
    return this._settleJob({ job, workerAwardUnits: BigInt(job.reward_units), refundUnits: 0n, actorType: 'agent', actorId: posterAgentId, outcome: 'completed' });
  }

  async openDispute(agentId, jobId, { reason, evidence_artifact_ids = [] }) {
    const job = this._requireJob(jobId);
    invariant([job.poster_agent_id, job.worker_agent_id].includes(agentId), 'FORBIDDEN', 'Only a job party may open a dispute.', 403);
    invariant([JOB_STATUS.IN_PROGRESS, JOB_STATUS.SUBMITTED, JOB_STATUS.UNDER_VERIFICATION].includes(job.status), 'INVALID_JOB_STATE', 'A dispute cannot be opened in the current state.', 409);
    requireString(reason, 'reason', 10);
    for (const artifactId of evidence_artifact_ids) {
      invariant(this._projection.artifacts.get(artifactId)?.job_id === jobId, 'ARTIFACT_NOT_FOUND', `Evidence artifact ${artifactId} does not belong to this job.`, 404);
    }
    const disputeId = newId('dsp');
    await this._append([
      this._input('dispute', disputeId, 'dispute.opened', 'agent', agentId, {
        job_id: jobId,
        opened_by_agent_id: agentId,
        reason,
        evidence_artifact_ids: [...evidence_artifact_ids]
      })
    ]);
    return this.getDispute(disputeId);
  }

  async resolveDispute(disputeId, { worker_award, rationale }, actorId = 'admin') {
    const dispute = this._projection.disputes.get(disputeId);
    invariant(dispute?.status === 'OPEN', 'DISPUTE_NOT_FOUND', 'Open dispute was not found.', 404);
    requireString(rationale, 'rationale', 10);
    const job = this._requireJob(dispute.job_id);
    const escrow = this._projection.escrows.get(job.job_id) ?? 0n;
    const award = worker_award === undefined ? escrow : parseNonnegativeCreditAmount(worker_award);
    invariant(award <= escrow, 'INVALID_AWARD', 'Worker award cannot exceed escrow.', 409);
    const refund = escrow - award;
    const resolutionEvent = this._input('dispute', disputeId, 'dispute.resolved', 'admin', actorId, {
      worker_award_units: award.toString(),
      refund_units: refund.toString(),
      rationale
    });
    return this._settleJob({
      job,
      workerAwardUnits: award,
      refundUnits: refund,
      actorType: 'admin',
      actorId,
      outcome: award > 0n ? 'completed' : 'refunded',
      disputeId,
      prefixEvents: [resolutionEvent]
    });
  }

  async cancelJob(posterAgentId, jobId) {
    const job = this._requireJob(jobId);
    this._assertPoster(job, posterAgentId);
    invariant([JOB_STATUS.DRAFT, JOB_STATUS.OPEN].includes(job.status), 'INVALID_JOB_STATE', 'Only draft or open jobs can be cancelled without dispute.', 409);
    const events = [];
    const escrow = this._projection.escrows.get(jobId) ?? 0n;
    if (escrow > 0n) {
      events.push(this._input('credit_account', job.poster_operator_id, 'credits.refunded', 'agent', posterAgentId, {
        operator_id: job.poster_operator_id,
        job_id: jobId,
        amount_units: escrow.toString()
      }));
    }
    events.push(this._input('job', jobId, 'job.cancelled', 'agent', posterAgentId, {}));
    await this._append(events);
    return this.getJob(jobId);
  }

  async runTimeouts(actorId = 'system') {
    const now = this._clock().getTime();
    const results = [];
    for (const job of [...this._projection.jobs.values()]) {
      if (job.status === JOB_STATUS.OPEN && Date.parse(job.spec.deadlines.application_deadline) <= now) {
        const escrow = this._projection.escrows.get(job.job_id) ?? 0n;
        const events = [];
        if (escrow > 0n) {
          events.push(this._input('credit_account', job.poster_operator_id, 'credits.refunded', 'system', actorId, {
            operator_id: job.poster_operator_id,
            job_id: job.job_id,
            amount_units: escrow.toString()
          }));
        }
        events.push(this._input('job', job.job_id, 'job.expired', 'system', actorId, {}));
        await this._append(events);
        results.push({ job_id: job.job_id, action: 'expired_and_refunded' });
        continue;
      }

      if (job.status === JOB_STATUS.ASSIGNED) {
        const deadline = job.assignment_accepted
          ? job.spec.deadlines.work_start_deadline
          : job.spec.deadlines.assignment_acceptance_deadline;
        if (deadline && Date.parse(deadline) <= now) {
          await this._append([this._input('job', job.job_id, 'assignment.timed_out', 'system', actorId, {
            previous_worker_agent_id: job.worker_agent_id,
            assignment_accepted: job.assignment_accepted
          })]);
          results.push({ job_id: job.job_id, action: 'assignment_reopened' });
          continue;
        }
      }

      if (job.status === JOB_STATUS.IN_PROGRESS && Date.parse(job.spec.deadlines.submission_deadline) <= now) {
        const escrow = this._projection.escrows.get(job.job_id) ?? 0n;
        const events = [];
        if (escrow > 0n) {
          events.push(this._input('credit_account', job.poster_operator_id, 'credits.refunded', 'system', actorId, {
            operator_id: job.poster_operator_id,
            job_id: job.job_id,
            amount_units: escrow.toString()
          }));
        }
        events.push(this._input('job', job.job_id, 'job.refunded', 'system', actorId, { reason: 'submission_deadline_missed' }));
        await this._append(events);
        results.push({ job_id: job.job_id, action: 'submission_timeout_refund' });
        continue;
      }

      if (job.status === JOB_STATUS.UNDER_VERIFICATION) {
        const verification = this._projection.verifications.get(job.latest_verification_id);
        const reviewWindowMs = Number(job.spec.deadlines.review_window_seconds ?? 0) * 1000;
        if (verification?.aggregate_result === 'accepted' && reviewWindowMs > 0 && Date.parse(verification.created_at) + reviewWindowMs <= now) {
          await this._settleJob({
            job,
            workerAwardUnits: BigInt(job.reward_units),
            refundUnits: 0n,
            actorType: 'system',
            actorId,
            outcome: 'completed'
          });
          results.push({ job_id: job.job_id, action: 'optimistic_acceptance' });
        }
      }
    }
    return results;
  }
}
