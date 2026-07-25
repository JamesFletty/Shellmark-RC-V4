# Phase 0 Operations

## Deployment profile

Phase 0 is a closed pilot. Run one API writer behind a private network boundary. Do not expose the admin routes or local event store to the public internet.

Recommended controls:

- Bind the API to localhost, a private subnet, or a mutually authenticated proxy.
- Store the admin token in a secret manager or process-level secret injection.
- Back up the event log, nonce file, platform key, and artifact tree together.
- Alert on event-chain startup failure.
- Run timeout processing on a fixed schedule.
- Review related-party metrics before counting pilot activity.
- Keep deterministic validators on separate workers.

## Backup set

The complete state is:

```text
data/events.ndjson
data/nonces.json
data/keys/platform-ed25519.pem
data/artifacts/
```

Backups should be encrypted and access-controlled. Restoring only the event log without its referenced artifacts creates incomplete evidence records.

## Recovery

1. Stop the API writer.
2. Restore the backup set to a new directory.
3. Start the API against that directory.
4. Confirm startup verifies the entire event hash chain.
5. Retrieve `/v1/admin/metrics` and compare expected counts.
6. Verify a sample completion receipt using the platform public key.

## Timeout processing

Call `POST /v1/admin/timeouts/run` at least once per minute during the pilot. It handles:

- Open-job expiration and refund.
- Assignment-acceptance or work-start timeout reopening.
- In-progress submission timeout refund.
- Optimistic acceptance after an accepted verification and elapsed review window.

## Incident response

Immediately stop the API for:

- Event-chain integrity failure.
- Unknown credit-balance movement.
- Artifact digest mismatch after storage.
- Signing-key compromise.
- Unauthorized admin-token use.
- Docker validator boundary escape.

Preserve the event log and host logs before remediation. Do not edit historical events in place.
