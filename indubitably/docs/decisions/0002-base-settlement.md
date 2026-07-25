# ADR 0002: Use Base for Initial On-Chain Settlement

## Status

Accepted for the first escrow implementation.

## Decision

Deploy the first USDC escrow implementation on Base after Phase 0 validation.

## Rationale

- EVM compatibility.
- Mature Solidity libraries and audit ecosystem.
- Low-cost settlement.
- Existing smart-account and policy-signing tooling.
- Strong fit with a TypeScript integration stack.

## Consequences

The system does not initially support Solana or cross-chain escrow. Adding another chain requires an independent wallet, indexer, reconciliation, incident, and legal review rather than a cosmetic adapter.
