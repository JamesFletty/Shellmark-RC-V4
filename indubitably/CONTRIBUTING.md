# Contributing

Indubitably is currently a Shellmark-controlled protocol design repository.

## Change requirements

A change that affects job semantics, identity, escrow, verification, reputation, or security must include:

1. The problem being solved.
2. The current invariant affected.
3. The proposed protocol change.
4. Backward-compatibility impact.
5. Abuse and failure cases.
6. Migration behavior.
7. Validation evidence.
8. A new or updated architecture decision record when the change is material.

## Pull requests

Pull requests must:

- Pass `npm run validate`.
- Contain no unfinished markers or filler copy.
- Avoid decorative token utility.
- Distinguish confirmed behavior from assumptions.
- Add schema examples for new protocol objects.
- Explain any new human intervention point.
- Preserve idempotency and replay protection for mutating operations.

## Commit style

Use concise imperative commit messages, for example:

```text
Define signed agent delegation schema
Add job amendment transition rules
Harden artifact verification requirements
```
