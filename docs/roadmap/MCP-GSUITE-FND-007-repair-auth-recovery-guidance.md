---
id: MCP-GSUITE-FND-007
area: FND
title: Repair authentication recovery guidance
theme: foundation-tooling
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 7c0346c8bf1b6a6b91b0e0df1ff99816b3fb608c
created_at: 2026-10-04T10:40:45Z
updated_at: 2026-10-04T12:09:54Z
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

- [x] Rewrite the 401 hint so it is actionable from any access level: name `gsuite_auth_start`, state that it is a `write` tool, and give the operator-controlled sequence of raising `MCP_GSUITE_ACCESS_LEVEL` to `write` in the client configuration, restarting the client, running the tool, and optionally returning to `read`. Do not include token paths or values.
- [x] Correct the auth-start instructions to the real package scripts (`bun run ki:server:auth:dev`, `bun run ki:server:auth:start`).
- [x] Replace brittle tier counts in the README and user guides with tier descriptions, so prose cannot drift from registrations again; leave catalogue generation and badges alone.
- [x] Add tests: the 401 hint text; the auth-start instructions naming only script keys present in `package.json`; `gsuite_auth_start` absent when registered through the access gate at `read` and present at `write`, with its annotations unchanged. No handler that starts consent or touches tokens is invoked.

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

## Review

### Delivered

The HTTP 401 hint now gives a recovery path that works from the default `read` level: it names `gsuite_auth_start`, says it is a write-level tool, and tells the operator to set `MCP_GSUITE_ACCESS_LEVEL=write` in the client's configuration, restart the client, run the tool and optionally return to `read`. `gsuite_auth_start` now points at the real `ki:server:auth:dev` / `ki:server:auth:start` scripts. The README and user guides describe the access tiers without numeric counts, and the revoked-token procedure mentions the access-level step. Access gating, annotations, OAuth scopes and token handling are unchanged.

### Change Summary

- `src/utils/errors.ts`: exported, rewritten `AUTH_HINT`.
- `src/main/auth-info/index.ts`: corrected auth-server commands.
- `src/utils/errors.test.ts`: hint assertions (tool name, level change, restart, return to read, no token path).
- `src/main/auth-info/index.test.ts`: the returned instructions name exactly the two auth-server scripts, and both exist in `package.json`.
- `src/tool-registration.test.ts`: through `makeAccessGatedRegister`, `gsuite_auth_start` is absent at `read` and present at `write` with `WRITE_REMOTE` annotations; no handler is invoked.
- `src/main/{calendar,drive-client,labels}/index.test.ts`: expected 401 messages follow the new hint.
- `README.md`, `docs/guides/user/configuration.md`, `docs/guides/user/troubleshooting.md`: tier prose without counts; troubleshooting adds the access-level step before re-authentication.

### Verification

- `bun run test:coverage`: 507 tests pass; statements, branches, functions and lines 100%.
- `bunx tsc --noEmit`, `bun run build`, `bun run ki:test:smoke` (49 tools listed, no `send_*` tools): pass.
- `bunx biome check .`: clean apart from one pre-existing schema-version info.
- `bunx knip`: only pre-existing configuration hints.
- `grep` finds no unprefixed `server:auth:` command in `src`, `docs` or the README, and no numeric tier counts in the README or user guides.
- `ki repo audit --repo .`: no FAIL.
- No Google account, consent flow or token store was used.

### Outstanding concerns

- The hint is static rather than tailored to the running access level; at `write` or above the "if your client does not list it" clause is simply inapplicable. Plumbing the level into `errMessage` was judged unnecessary churn.
- The README no longer states a total tool count; the smoke test remains the inventory check.
- A release is needed for installed users to receive the corrected messages.

### Post-change review

The 401 hint is appended on every Google API path through `errMessage`, so one constant fixes every surface; the three feature tests that pin full error strings were updated rather than loosened. The registration test exercises the real access-gate proxy with real auth tool definitions, so a future annotation change on `gsuite_auth_start` fails it.

### Mini recap

A read-only caller that hits a 401 now learns the operator steps to re-authenticate, the sign-in tool names commands that exist, and the guides no longer carry tool counts that drift.

## Discussion

### Recovery from the read tier

The installation and authentication guides already explain raising `MCP_GSUITE_ACCESS_LEVEL` to write and restarting the client before invoking `gsuite_auth_start`. The inline 401 hint omits that necessary step, leaving a read-only caller with an unavailable remedy. Shape recovery instructions to explain the required operator-controlled tier change and restart, then consent and an optional return to read access. Preserve token secrecy and the distinction between client configuration and the standalone auth server's shell environment.

### Commands and tier evidence

Use the actual package script keys as the command authority. Any correction should verify both returned auth-start instructions and human guides. Decide whether tier prose should avoid brittle counts or be checked against fixture registrations; this record does not adopt catalogue generation. Tests should reproduce 401 guidance with auth absent at read, auth available at write, and unchanged write annotations, without invoking consent or touching tokens.

### Receiver-owned intake

This unadopted Triage draft records verified evidence from `KI-ARCADIA-ECO-004`; GSuite retains selection, readiness, delivery, review, and acceptance authority. It has no implementation baseline and authorises no execution. The independent identifier reservation landed in `055269ff1295786569d0821d13e8fc7cef2d876e` before this record was created.

### Adoption

Adopted from Triage into `next` and shaped to Ready on 2026-10-04 under the owner's delegated estate-push authority. Decision on tier evidence: the prose drops numeric counts rather than adding a docs-versus-fixture check, because counts are the part that keeps drifting and the tier descriptions carry the operator meaning.
