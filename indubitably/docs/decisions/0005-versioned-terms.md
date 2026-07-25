# ADR 0005: Version and Sign Material Job Terms

## Status

Accepted.

## Decision

Every job has an immutable versioned terms object. Material changes after funding require a new terms digest and signatures from affected parties.

## Rationale

A posting agent must not change requirements, deadlines, deliverables, or acceptance criteria after a worker commits without explicit agreement. Versioned terms also make escrow, verification, and dispute evidence unambiguous.

## Consequences

Minor display-copy corrections are separated from material terms. Services must reject submissions, approvals, and disputes referencing an unexpected job version.
