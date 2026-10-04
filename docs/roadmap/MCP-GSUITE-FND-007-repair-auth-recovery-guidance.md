---
id: MCP-GSUITE-FND-007
area: FND
title: Repair authentication recovery guidance
theme: foundation-tooling
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-04T10:40:45Z
updated_at: 2026-10-04T12:06:45Z
---

## Goal

Make authentication recovery instructions reachable from the default read access level, and align authentication startup commands and access-tier guidance with the registered server surface.

## Context

[Arcadia's deferred findings reconciliation](../../../ki-arcadia-principal/Streams/Roadmap/KI-ARCADIA-ECO-004-route-deferred-mcp-findings.md), `KI-ARCADIA-ECO-004`, identified these related GSuite findings. A fresh fixture-only reproduction against source at `f9ab8d40080621708438f612f7fc64d1db5404fa` confirms that `src/utils/errors.ts` recommends `gsuite_auth_start` on HTTP 401 while the default read gate excludes that write tool. The fixture registers tools without invoking handlers or contacting Google, and reports 22 read, 23 write, and 4 destructive tools; read visibility totals 22 and excludes `gsuite_auth_start`.

`src/main/auth-info/index.ts` recommends `bun run server:auth:dev` and `bun run server:auth:start`, while `package.json` defines `ki:server:auth:dev` and `ki:server:auth:start`. The configuration and troubleshooting guides still state older tier counts, including 18 readers, 21 additional write tools, and three destructive tools, rather than the current fixture inventory.

## Boundary

Keep this intake limited to authentication recovery messaging, its documented operator procedure, stale startup commands, and inaccurate access-tier prose. Preserve `gsuite_auth_start` as a write tool because its consent flow persists tokens; do not weaken annotations or bypass the access gate. Do not change OAuth scopes, token persistence, sending policy, or tool behavior. No live Google account or token-store operations are authorised by this record. Package badges, generated catalogues, and legacy protocol policy are separate concerns.

## Current state

`src/utils/errors.ts` appends "Run the `gsuite_auth_start` tool to refresh the OAuth token." to every HTTP 401 message, although that tool is not registered at the default `read` level. `src/main/auth-info/index.ts` tells the operator to start the auth server with `bun run server:auth:dev` or `bun run server:auth:start`, which do not exist; `package.json` defines `ki:server:auth:dev` and `ki:server:auth:start`. `docs/guides/user/configuration.md` and `docs/guides/user/troubleshooting.md` state 18 read, 21 write and three destructive tools, and `README.md` states 46 tools split 20/22/4, while the registered inventory is 22 read, 23 write and 4 destructive.

## Steps

- [ ] Rewrite the 401 hint so it is actionable from any access level: name `gsuite_auth_start`, state that it is a `write` tool, and give the operator-controlled sequence of raising `MCP_GSUITE_ACCESS_LEVEL` to `write` in the client configuration, restarting the client, running the tool, and optionally returning to `read`. Do not include token paths or values.
- [ ] Correct the auth-start instructions to the real package scripts (`bun run ki:server:auth:dev`, `bun run ki:server:auth:start`).
- [ ] Replace brittle tier counts in the README and user guides with tier descriptions, so prose cannot drift from registrations again; leave catalogue generation and badges alone.
- [ ] Add tests: the 401 hint text; the auth-start instructions naming only script keys present in `package.json`; `gsuite_auth_start` absent when registered through the access gate at `read` and present at `write`, with its annotations unchanged. No handler that starts consent or touches tokens is invoked.

## Files touched

`src/utils/errors.ts`, `src/utils/errors.test.ts`, `src/main/auth-info/index.ts` and its co-located test, `src/tool-registration.test.ts` (or a focused access-gate test), `README.md`, `docs/guides/user/configuration.md`, `docs/guides/user/troubleshooting.md`.

## Verify

Focused tests above pass. `bun run test`, `bun run test:coverage` (100% thresholds), `bunx tsc --noEmit`, `bun run build`, `bunx biome check .`, `bunx knip`, `bun run ki:test:smoke` and `ki repo audit --repo .` pass with no FAIL. `grep` finds no `server:auth:` command without the `ki:` prefix and no numeric tier counts in the README or user guides. No live Google account, consent flow or token store is used.

## Dependencies / blocks

None. The change is local to messaging, tests and documentation.

## Documentation impact

### Decision Records

None; the access-level policy is unchanged.

### Specifications

None.

### Guides

`docs/guides/user/configuration.md` and `docs/guides/user/troubleshooting.md` lose their tool counts; the authentication guide already describes the recovery sequence and needs no change.

### Roadmap

This record only.

## Discussion

### Recovery from the read tier

The installation and authentication guides already explain raising `MCP_GSUITE_ACCESS_LEVEL` to write and restarting the client before invoking `gsuite_auth_start`. The inline 401 hint omits that necessary step, leaving a read-only caller with an unavailable remedy. Shape recovery instructions to explain the required operator-controlled tier change and restart, then consent and an optional return to read access. Preserve token secrecy and the distinction between client configuration and the standalone auth server's shell environment.

### Commands and tier evidence

Use the actual package script keys as the command authority. Any correction should verify both returned auth-start instructions and human guides. Decide whether tier prose should avoid brittle counts or be checked against fixture registrations; this record does not adopt catalogue generation. Tests should reproduce 401 guidance with auth absent at read, auth available at write, and unchanged write annotations, without invoking consent or touching tokens.

### Receiver-owned intake

This unadopted Triage draft records verified evidence from `KI-ARCADIA-ECO-004`; GSuite retains selection, readiness, delivery, review, and acceptance authority. It has no implementation baseline and authorises no execution. The independent identifier reservation landed in `055269ff1295786569d0821d13e8fc7cef2d876e` before this record was created.

### Adoption

Adopted from Triage into `next` and shaped to Ready on 2026-10-04 under the owner's delegated estate-push authority. Decision on tier evidence: the prose drops numeric counts rather than adding a docs-versus-fixture check, because counts are the part that keeps drifting and the tier descriptions carry the operator meaning.
