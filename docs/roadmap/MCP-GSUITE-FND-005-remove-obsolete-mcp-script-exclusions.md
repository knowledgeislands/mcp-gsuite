---
id: MCP-GSUITE-FND-005
area: FND
title: Remove MCP exclusions
theme: foundation-tooling
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: c4332340f0f3ae69ed4e99abade9da2fee746cf2
---

## Goal

Recognise the repository's authentication and integration-recording commands as MCP-owned capabilities without obsolete local exceptions.

## Context

Harness commit `de881b6d` assigns `ki:server:auth:dev`, `ki:server:auth:start`, `ki:test:record`, and `ki:test:replay` to `ki-repo-mcp`. This repository already implements those exact commands and currently lists them under `[skills.ki-engineering].script_exclusions`, which now fails `SCR-3` because exclusions cannot overlap the `ki:` capability namespace.

## Boundary

Remove only the four obsolete exclusions. Do not rename or change package scripts, start an authentication server, record or replay an integration session, contact an external system, close this record, prune it, or push.

## Current state

The selected local adapter is `roadmap`, the central claim prerequisite has landed, the work tree is clean at receiver baseline `18a99edd8651573e97b3a10a58676d930d8dd86c`, and focused `ki-work` and `ki-work-roadmap` audits pass. The focused engineering audit has one expected `SCR-3` failure naming exactly the four obsolete exclusions; the focused MCP audit passes.

## Steps

- [x] Remove the exact `script_exclusions` key while preserving `dependency_holds` and every other `.ki.toml` value.
- [x] Prove the four package script names and bodies remain unchanged.
- [x] Run the required focused audits, TypeScript check, tests, TOML parse, and diff check.
- [x] Record the canonical review packet and bound batch-run evidence, then stop at `awaiting-review`.

## Files touched

- `.ki.toml`
- `docs/roadmap/_ISSUES.md`
- `docs/roadmap/MCP-GSUITE-FND-005-remove-obsolete-mcp-script-exclusions.md`
- `+/_AUTHORISATIONS/MCP-GSUITE-BATCH-001.md`

## Verify

Run `ki repo audit --skill ki-engineering --repo .`, `ki repo audit --skill ki-repo-mcp --repo .`, `bunx tsc --noEmit`, `bun run test`, `ki repo audit --skill ki-work-roadmap --repo .`, a TOML parse with a package-script equality assertion, and `git diff --check`.

## Dependencies / blocks

Harness commit `de881b6d` satisfies the sole external prerequisite by publishing the four exact MCP script claims. Execution is coordinator-only because `ki-delegation` is not declared or resolved in this receiver, and this one-file implementation does not benefit from a delegated lane.

## Documentation impact

### Decision Records

No decision record change is needed; the harness engineering and MCP standards already own the namespace decision.

### Specifications

No specification changes are needed because package commands and runtime behaviour remain unchanged.

### Guides

No guide changes are needed because existing command names and usage remain unchanged.

### Roadmap

This receiver-owned record and its batch authorisation provide the durable implementation and review evidence. No follow-on item is planned unless verification reveals unrelated work.

## Review

### Delivered

Delivered the approved configuration-only cleanup from immutable implementation baseline `c4332340f0f3ae69ed4e99abade9da2fee746cf2`; implementation commit `8aa3596f7195015e59bc0ff30d924b57987a0294` removes exactly the four obsolete MCP script exclusions. Package scripts, external systems, closure, pruning, pushing, and release remained outside the change.

### Summary of changes

- Removed `[skills.ki-engineering].script_exclusions` from `.ki.toml` while retaining `dependency_holds` and all other configuration.
- Kept all four capability-owned package script names and command bodies byte-for-byte unchanged.
- Added the receiver-owned roadmap record, advanced its FND ledger, and bound execution to `MCP-GSUITE-BATCH-001`.

### Verification

- TOML parsing and an explicit equality assertion for the four package script bodies passed.
- `ki repo audit --skill ki-engineering --repo .` passed, clearing the former `SCR-3` failure.
- `ki repo audit --skill ki-repo-mcp --repo .` passed.
- `bunx tsc --noEmit` passed.
- `bun run test` passed: 21 files and 466 tests.
- `ki repo audit --skill ki-work-roadmap --repo .`, Markdown checking, and `git diff --check` passed.

### Outstanding concerns

None within the approved boundary. No auth server or live record/replay command was executed, as required.

### Post-change review

The goal and scope are met. The change is limited to removing a redundant configuration exception after the owning MCP capability published exact claims; static equality evidence bounds regression risk, and the focused engineering and MCP audits agree on ownership. The item is ready for human acceptance.

### Mini recap

The four existing commands now resolve through `ki-repo-mcp` without local exclusions. Verification is complete, no package or runtime behaviour changed, and no durable learning or follow-on route is required.

## Discussion

### Ownership classification

All four commands are conditional MCP capability operations backed by `src/auth-server/index.ts` and the paired `scripts/integration.ts` recording harness. They remain `ki:` commands; neither `self:` renaming nor a bare external exception is appropriate.
