---
id: MCP-GSUITE-FND-008
area: FND
title: Gated read-only harness
theme: foundation-tooling
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-05T08:07:43Z
updated_at: 2026-10-05T08:07:43Z
---

## Goal

Make a designated disposable Google account verifiable through a read-only, explicit opt-in command whose safety boundaries can be proven offline.

## Context

The user authorised completion of all locally feasible MCP roadmap work, with maximal delegation and review-based acceptance. This child isolates local infrastructure from the real-account outcome in [the parent live-test item](MCP-GSUITE-FND-002-add-a-gated-live-api-test.md). The coordinator approved this bounded plan under current outcome authority; no real-account selection or provider execution is included.

## Boundary

Use the primary checkout and existing Google client, OAuth token persistence and read handlers. Require exact `INTEGRATION=1`, a nonsecret expected disposable email, an explicit dedicated absolute token-file path and OAuth client credentials before provider access. Verify Gmail identity first, then perform only read-only label, bounded Calendar and Drive metadata requests. Never send, draft, archive, delete, copy user state, record responses, change mcporter registration, or contact providers during delivery. Refresh may atomically update only the designated token file. Return only a success indicator and counts; suppress provider payloads and errors. Default tests and CI stay offline and retain 100% coverage thresholds.

## Current state

Baseline local main is `3be467294de74354806427077ff39535ff5e7d9b`, with a clean tree. FND identifiers through 007 are reserved and no historical FND-008 path exists. The legacy untyped mcporter script only invokes metadata and its record/replay commands use user mcporter state. No disposable identity, dedicated tokens, consent evidence or real-provider run has been supplied.

## Steps

- [ ] Implement a typed injectable fail-closed runner and dedicated command using existing OAuth and service seams plus real read handlers.
- [ ] Exercise guards, missing/malformed credentials, identity mismatch, bounded counts, sensitive-error suppression and actual Google SDK request construction using isolated synthetic transports and temporary token files.
- [ ] Document the exact opt-in and local token-refresh effect, distinguish legacy record/replay and update the parent with the remaining real-account boundary.
- [ ] Run the full repository gates and focused audits, then return the six-heading review packet at Awaiting review without acceptance or pruning.

## Files touched

`src/main/integration-readonly/index.ts`, its colocated tests, `scripts/integration-readonly.ts`, `package.json`, `knip.json`, developer guide and index, the parent and child roadmap records, the issue ledger and the exact batch envelope.

## Verify

Run `bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, `bun run ki:test:smoke`, `bunx biome check .`, `bunx knip`, and sequential focused audits for `ki-engineering`, `ki-repo-mcp`, `ki-work-roadmap`, `ki-guides` and `ki-authoring`. Coverage must remain 100% across all four metrics. Synthetic transport tests must observe real SDK GET URLs and query bounds, no calls after identity mismatch and no real network. Neither the new live command nor legacy record/replay may be executed against providers.

## Dependencies / blocks

No implementation dependencies. Parent FND-002 remains Waiting-for / Draft because it needs the principal to designate the real disposable account and dedicated credential source and authorise the documented read-only run; synthetic success is not live evidence.

## Delegation

The root coordinator delegated exclusive repository ownership to this worker in the primary checkout. This worker owns the enumerated files and full local verification. The root independently reviews the exact candidate before any acceptance or pruning. No additional worker is needed for this cohesive runner and transport boundary.

## Documentation impact

### Decision Records

No durable architecture decision beyond the approved conservative first slice; existing injected configuration and credential contracts are reused.

### Specifications

No MCP tool surface or public library behavior changes; the separately typed developer command documents its exact gate.

### Guides

Add a developer guide for safe gated execution, output privacy, token-refresh effects and legacy record/replay limitations.

### Roadmap

Ship this child to Awaiting review and retain the parent as Waiting-for / Draft with the remaining identity, consent and real-provider evidence clearly stated.

## Discussion

### Separation of infrastructure and live evidence

Offline tests can prove guard and request construction behavior. They cannot prove Google consent, granted scopes or provider responses for a real account. The parent owns that remaining outcome.

### Conservative operation choice

Gmail profile identity is checked before other reads. Calendar listing and Drive root metadata use one bounded page; Gmail label listing has no provider page-size option. No mailbox mutation is needed to make the first meaningful read-only slice inspectable.
