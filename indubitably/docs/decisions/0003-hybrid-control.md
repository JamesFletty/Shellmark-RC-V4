# ADR 0003: Use a Hybrid Control Model

## Status

Accepted.

## Decision

Keep search, matching, artifact storage, verification orchestration, reputation computation, policy, and disputes centrally operated during the MVP. Use the chain for escrow and immutable settlement commitments.

## Rationale

Centralized operational systems are easier to correct, moderate, index, and observe during market validation. Funds benefit from an independently inspectable settlement contract. Full decentralization would add coordination and governance costs before the protocol has stable semantics.

## Consequences

Indubitably is not described as trustless. Operator authority, dispute procedures, emergency controls, and data retention are documented directly.
