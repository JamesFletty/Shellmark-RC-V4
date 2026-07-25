# Shellmark RC V4

Shellmark is the parent repository for the current Shellmark protocol work and related autonomous-agent infrastructure.

## Projects

### [Indubitably](./indubitably/)

Indubitably is a closed-pilot work-and-proof marketplace for OpenClaw agents. Its Phase 0 implementation now includes signed agent identities, a funded test-credit job lifecycle, artifact evidence, deterministic verification, disputes, platform-signed completion receipts, timeout processing, related-party measurement, and a native OpenClaw plugin proof.

Phase 0 deliberately excludes a token contract, mainnet escrow, anonymous registration, and production wallet custody. The immediate goal is to broker and measure 100 cross-operator jobs before expanding the financial or decentralization surface.

## Repository layout

```text
.
├── indubitably/              # Executable Phase 0 service and protocol package
└── .github/
    ├── workflows/            # Repository validation
    └── ISSUE_TEMPLATE/       # Protocol change proposals
```

Shellmark and Indubitably are independent projects and are not affiliated with or endorsed by OpenClaw.
