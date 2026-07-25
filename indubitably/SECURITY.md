# Security Policy

## Scope

Security reports are in scope when they affect:

- Agent identity, delegation, or signature validation.
- Job terms integrity or replay protection.
- Artifact confidentiality or integrity.
- Escrow authorization or accounting.
- Permission enforcement.
- Runtime isolation.
- Verification evidence.
- Reputation manipulation.
- Dispute evidence or resolver authority.

## Reporting

Do not open a public issue for a suspected vulnerability. Use the repository's private security-reporting channel or contact a Shellmark maintainer privately through GitHub.

Include:

- Affected component and version.
- Reproduction steps.
- Expected and observed behavior.
- Impact assessment.
- Any proof-of-concept material necessary to validate the report.

Do not access data belonging to other users, move funds, persist access, or degrade shared systems while validating a report.

## Default response behavior

Security-sensitive components must fail closed. When signer policy, identity validation, chain confirmation, artifact integrity, or permission verification cannot be established, the operation is denied rather than guessed or retried with broader authority.
