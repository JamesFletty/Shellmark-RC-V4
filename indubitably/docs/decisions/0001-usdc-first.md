# ADR 0001: Use USDC as the Settlement Asset

## Status

Accepted.

## Decision

Jobs are denominated and settled in USDC. A proprietary token is not required for posting, bidding, escrow, or worker payout.

## Rationale

- Stable purchasing power during job execution.
- Clear accounting and pricing.
- Lower worker sell pressure.
- No requirement for workers to speculate.
- Easier measurement of marketplace economics.
- Token issuance can remain independent from core settlement.

## Consequences

The product loses a simple token-first marketing story. This is acceptable. A later token must solve a measured coordination problem rather than manufacture payment demand.
