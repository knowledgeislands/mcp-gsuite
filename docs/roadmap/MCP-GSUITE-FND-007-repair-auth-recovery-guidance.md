---
id: MCP-GSUITE-FND-007
area: FND
title: Repair authentication recovery guidance
theme: foundation-tooling
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-04T10:40:45Z
updated_at: 2026-10-04T10:40:45Z
---

## Goal

Make authentication recovery instructions reachable from the default read access level, and align authentication startup commands and access-tier guidance with the registered server surface.

## Context

[Arcadia's deferred findings reconciliation](../../../ki-arcadia-principal/Streams/Roadmap/KI-ARCADIA-ECO-004-route-deferred-mcp-findings.md), `KI-ARCADIA-ECO-004`, identified these related GSuite findings. A fresh fixture-only reproduction against source at `f9ab8d40080621708438f612f7fc64d1db5404fa` confirms that `src/utils/errors.ts` recommends `gsuite_auth_start` on HTTP 401 while the default read gate excludes that write tool. The fixture registers tools without invoking handlers or contacting Google, and reports 22 read, 23 write, and 4 destructive tools; read visibility totals 22 and excludes `gsuite_auth_start`.

`src/main/auth-info/index.ts` recommends `bun run server:auth:dev` and `bun run server:auth:start`, while `package.json` defines `ki:server:auth:dev` and `ki:server:auth:start`. The configuration and troubleshooting guides still state older tier counts, including 18 readers, 21 additional write tools, and three destructive tools, rather than the current fixture inventory.

## Boundary

Keep this intake limited to authentication recovery messaging, its documented operator procedure, stale startup commands, and inaccurate access-tier prose. Preserve `gsuite_auth_start` as a write tool because its consent flow persists tokens; do not weaken annotations or bypass the access gate. Do not change OAuth scopes, token persistence, sending policy, or tool behavior. No live Google account or token-store operations are authorised by this record. Package badges, generated catalogues, and legacy protocol policy are separate concerns.

## Discussion

### Recovery from the read tier

The installation and authentication guides already explain raising `MCP_GSUITE_ACCESS_LEVEL` to write and restarting the client before invoking `gsuite_auth_start`. The inline 401 hint omits that necessary step, leaving a read-only caller with an unavailable remedy. Shape recovery instructions to explain the required operator-controlled tier change and restart, then consent and an optional return to read access. Preserve token secrecy and the distinction between client configuration and the standalone auth server's shell environment.

### Commands and tier evidence

Use the actual package script keys as the command authority. Any correction should verify both returned auth-start instructions and human guides. Decide whether tier prose should avoid brittle counts or be checked against fixture registrations; this record does not adopt catalogue generation. Tests should reproduce 401 guidance with auth absent at read, auth available at write, and unchanged write annotations, without invoking consent or touching tokens.

### Receiver-owned intake

This unadopted Triage draft records verified evidence from `KI-ARCADIA-ECO-004`; GSuite retains selection, readiness, delivery, review, and acceptance authority. It has no implementation baseline and authorises no execution. The independent identifier reservation landed in `055269ff1295786569d0821d13e8fc7cef2d876e` before this record was created.
