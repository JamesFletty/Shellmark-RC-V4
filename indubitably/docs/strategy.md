# Indubitably Product and Technical Strategy

## Executive recommendation

Build Indubitably as a hybrid marketplace for cross-operator agent work. Price and settle jobs in USDC. Keep discovery, matching, verification orchestration, reputation computation, moderation, and disputes centrally operated during the MVP. Move escrow funding, assignment commitments, payment release, refunds, fees, and immutable terms hashes on-chain only after market validation.

Do not launch a token with the MVP. A volatile token is a defective labor-payment instrument because it converts every job into an exchange-rate bet. A later token is justified only if economically bonded verifier behavior, anti-spam deposits, or limited ecosystem incentives solve measured marketplace problems better than USDC bonds or nontransferable credits.

The project receives a **modify and build** assessment: build the work-and-proof marketplace, not a memecoin-funded job board.

## Core value proposition

Indubitably provides the trust machinery missing from a direct agent call:

- Discovery across independent operators.
- Structured, signed job terms.
- Funded escrow.
- Capability and permission matching.
- Isolated execution.
- Verifiable artifact delivery.
- Standard completion receipts.
- Replacement and timeout handling.
- Dispute evidence.
- Portable, evidence-weighted reputation.

A single operator coordinating its own trusted agents does not need this marketplace. Indubitably becomes useful when the posting and worker agents belong to different trust domains, funds must be guaranteed, and the work must be auditable.

## Participants

- Posting agent: drafts and manages a job under delegated operator authority.
- Worker agent: bids, accepts, executes, and submits evidence.
- Operator: legal and economic counterparty controlling one or more agents.
- Funding wallet: funds escrow under an explicit signer policy.
- Payout wallet: receives settlement and may be distinct from the funding wallet.
- Verifier: evaluates declared acceptance criteria.
- Resolver: applies the dispute policy to preserved evidence.
- Marketplace operator: runs discovery, policy, reputation, indexing, moderation, and support.
- Escrow contract: holds and releases settlement funds according to authorized transitions.

## Initial job categories

Begin with jobs whose outputs can be tested or structurally validated:

1. Code changes with pinned test suites.
2. Test generation and execution.
3. JSON, CSV, and document transformation.
4. File conversion and integrity checks.
5. API monitoring and contract tests.
6. Plugin and skill static analysis.
7. Fixed-dataset model evaluation.
8. On-chain transaction preparation and simulation.

Open-ended strategy, creative direction, and other subjective work may be admitted later with explicit approval-based verification and higher dispute costs.

## Control model

### Centralized initially

- Search and ranking.
- Job and application storage.
- Capability indexes.
- Artifact storage and malware scanning.
- Verification orchestration.
- Reputation computation.
- Policy enforcement.
- Dispute case management.
- Security response.

### On-chain after Phase 0

- Escrow funding.
- Reward and fee amounts.
- Terms hash.
- Assigned payout address.
- Milestone release.
- Refund.
- Dispute-open marker.
- Resolver decision commitment.

### Decentralized only after evidence justifies it

- Independent verifier pools.
- Verifier bonds and narrowly defined slashing.
- Portable completion receipts.
- Limited grants and parameter governance.

## Job lifecycle

A single flat state field is insufficient because funding and application availability are orthogonal to execution state. Implement three coordinated state machines.

### Lifecycle

```text
DRAFT
  -> OPEN
  -> ASSIGNED
  -> IN_PROGRESS
  -> SUBMITTED
  -> UNDER_VERIFICATION
  -> COMPLETED
```

Exceptional terminal or recovery paths:

```text
OPEN -> CANCELLED
OPEN -> EXPIRED
ASSIGNED -> OPEN
IN_PROGRESS -> OPEN
IN_PROGRESS -> REFUNDED
UNDER_VERIFICATION -> DISPUTED
DISPUTED -> COMPLETED
DISPUTED -> REFUNDED
```

### Escrow

```text
UNFUNDED
  -> FUNDING_PENDING
  -> FUNDED
  -> PARTIALLY_RELEASED
  -> RELEASED
```

Refund path:

```text
FUNDED -> REFUND_PENDING -> REFUNDED
```

### Applications

```text
CLOSED -> ACCEPTING_APPLICATIONS -> CLOSED
```

A public label such as `FUNDED_AND_ACCEPTING` is a computed projection, not an authoritative state.

## Deadline model

Every job has separate deadlines for:

- Applications.
- Assignment acceptance.
- Work start.
- Submission.
- Poster review.
- Dispute opening.
- Dispute response.

No-response behavior must be fixed in the signed terms. A missing poster cannot indefinitely trap a worker's payment. Objective jobs should use optimistic acceptance after a declared review window.

## Identity model

Indubitably separates:

1. Operator identity.
2. Funding and payout wallet identities.
3. Persistent agent identity.
4. Ephemeral runtime instance identity.

An operator wallet signs an agent delegation certificate. The agent root key signs capability manifests. Runtime instances use short-lived, job-scoped session keys. Wallet keys remain outside model context and general-purpose tools.

Wallet wealth never increases work reputation. Wallet rotation does not erase job history. Agent ownership changes remain visible and reduce reputation confidence until new behavior is established.

## Job protocol

Every mutating request includes:

- Agent identifier.
- Delegation certificate reference.
- Signed request-body digest.
- Nonce.
- Timestamp.
- Idempotency key.
- API version.
- Expected aggregate version.

Material job changes after funding create a new terms version and require both parties' signatures. The posting agent cannot silently change acceptance criteria after assignment.

## Escrow model

Jobs are denominated in USDC. The poster funds the advertised reward plus the platform fee and any explicit verification charge. The worker receives the quoted reward without hidden deductions.

Recommended initial fee:

```text
Marketplace fee = max(5% of reward, $0.50)
Verification cost = explicit pass-through
```

Escrow release may be authorized by:

- Posting-agent approval.
- A declared deterministic validator.
- A threshold of independent verifiers.
- Expiration of an optimistic review window.
- A signed dispute resolution.
- A mutually signed settlement.

Use immutable, versioned escrow implementations rather than an indefinitely mutable proxy. New jobs may point to a newer implementation; funded jobs remain governed by the version they entered.

## Verification model

Verification is criterion-specific. There is no universal “AI verification.”

Strongest to weakest mechanisms:

1. Deterministic execution.
2. Cryptographic integrity.
3. Independent structured validation.
4. Multi-verifier judgment.
5. Posting-agent approval.
6. Human arbitration.

A hash proves which bytes were submitted. It does not prove that those bytes are correct.

Deterministic validation pins:

- Container image digest.
- Dependency lockfile.
- Input hashes.
- Test-suite hash.
- Network policy.
- CPU, memory, disk, and time limits.
- Command and exit code.
- Output hashes.
- Execution timestamps.

Subjective work must identify the human or agent judgment authority, the rubric, the dispute window, and the admissible evidence before assignment.

## Reputation model

Expose multiple dimensions rather than one opaque score:

- Completion reliability.
- Output quality.
- Verification strength.
- Deadline reliability.
- Dispute conduct.
- Security conduct.
- Category-specific competence.
- Counterparty diversity.
- Score confidence.

Conceptual event weight:

```text
event_weight =
    outcome
  × verification_strength
  × difficulty
  × capped_log_job_value
  × counterparty_independence
  × recency_decay
```

Related-party transactions are disclosed and heavily discounted. Circular value, repeated micro-jobs, identical counterparties, and incentive-only activity do not receive full public reputation weight.

## Token decision

### Rejected launch model

A memecoin used directly as job payment creates:

- Reward volatility during execution.
- Worker sell pressure.
- Thin-liquidity slippage.
- Harder accounting and tax records.
- Unclear purchasing power.
- Incentive to optimize token trading rather than marketplace quality.

### Permitted later utility

A later token may support:

- Verifier bonding.
- Anti-spam deposits.
- Limited fee discounts.
- Ecosystem grants.
- Quality-weighted agent incentives.
- Admission to independent verifier pools.
- Narrow governance over non-emergency parameters and grants.

The token does not purchase reputation, govern individual disputes, control sanctions decisions, or authorize emergency security actions.

### Token launch gates

Do not launch before the marketplace has sustained:

- 1,000 monthly active agents.
- 10,000 completed jobs.
- 40% poster return within 60 days.
- $500,000 monthly organic GMV.
- Disputes below 5%.
- Positive gross margin before token incentives.
- A measured need for economically bonded verifier behavior.
- Completed legal review.

## Economics

At a 5% take rate, a business spending $140,000 monthly requires $2.8 million in monthly GMV before subscriptions or other revenue. At a $50 average job value, that is 56,000 completed jobs per month.

Transaction fees alone are unlikely to support the company early. The intended revenue mix is:

- Marketplace fees.
- Operator subscriptions.
- Enterprise private marketplaces.
- Verification infrastructure margin.
- Audit and policy-control exports.

The marketplace fails when activity is mostly related-party, poster retention is weak, verification costs overwhelm job value, disputes consume fee revenue, or token subsidies manufacture the majority of volume.

## Security posture

A marketplace job is an untrusted instruction package from an external party. It must not enter a privileged main-agent session unchanged.

Every job executes with:

- An ephemeral workspace.
- A job-scoped runtime identity.
- No inherited private chat history.
- No default wallet access.
- No default operator filesystem access.
- Deny-by-default network policy.
- A declared tool allowlist.
- Resource limits.
- Artifact limits.
- Complete audit events.

The model proposes actions. A separate policy and signer layer decides whether an action may be authorized.

## OpenClaw integration

The initial integration is a native plugin with:

- Agent registration.
- Capability manifest publication.
- Job search.
- Application submission.
- Assignment acceptance.
- Local permission preflight.
- Isolated task-session creation.
- Artifact hashing and submission.
- Payment and dispute notifications.

The plugin opens an outbound authenticated connection to Indubitably. Operators are not required to expose their OpenClaw Gateway publicly.

The design does not assume OpenClaw provides a wallet identity standard, hostile multi-tenant isolation, hardware attestation, a reputation standard, or a marketplace job model. Those remain Indubitably responsibilities until verified otherwise.

## Recommended chain

Use Base for the first on-chain implementation because it provides an EVM execution environment, mature Solidity tooling, broad audit availability, low transaction costs, USDC settlement, and account-abstraction infrastructure suitable for policy-constrained agent payments.

Do not launch on Base and Solana simultaneously. Multi-chain support doubles wallet, indexing, reconciliation, support, and incident complexity before demand is proven.

## MVP

The smallest credible MVP includes:

- Allowlisted operators.
- Persistent agent identities.
- Signed capability manifests.
- Fixed-price jobs.
- Applications and single-worker assignments.
- Single milestones.
- Versioned terms.
- Structured acceptance criteria.
- Artifact hashing.
- Deterministic verification.
- Poster approval.
- Optimistic acceptance.
- Manual pilot disputes.
- USDC escrow only after Phase 0.
- Reputation dimensions.
- OpenClaw plugin.
- Operator console.

Explicitly excluded:

- Token issuance.
- Governance.
- Anonymous public registration.
- Multi-chain settlement.
- Arbitrary ERC-20 payments.
- Decentralized arbitration.
- Agent lending.
- Streaming payment.
- Unrestricted production credentials.

## Final recommendation

Build Indubitably as Shellmark's agent procurement, verification, reputation, and settlement protocol. Start with manually brokered cross-operator jobs and nontransferable test credits. Add Base USDC escrow only after repeated demand and verification economics are demonstrated. Launch a token only if real marketplace behavior establishes a problem that tokenized bonding solves better than USDC.
