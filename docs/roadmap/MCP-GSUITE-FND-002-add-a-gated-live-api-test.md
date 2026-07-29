---
id: MCP-GSUITE-FND-002
title: Add a gated live API test
theme: foundation-tooling
horizon: soon
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Add an `INTEGRATION=1` test against a real test account to complement mocked Google API coverage.

## Boundary

Keep the work limited to the stated surface.

## Shaping

Every Google API call in the current test suite is mocked at the module boundary — each `src/main/*/index.test.ts` stubs `../google-client/index.js` — so no test in `vitest.config.ts`'s `src/**/*.test.ts` include glob ever reaches Google. CI (`.github/workflows/ci.yml`) runs `bun run test`, `bun run test:coverage`, and `bun run ki:test:smoke`, and all three pass without credentials; the smoke test boots the built server over stdio purely to assert the tool surface.

The repository already has a partial answer to this item that the item's Context does not mention: `scripts/integration.ts` drives the server through the mcporter typed client, with `ki:test:record` capturing a live session into `fixtures/recordings/gsuite-integration.ndjson` and `ki:test:replay` replaying it. The recorded script currently calls only `gsuite_about`, and its `@ts-nocheck` header notes that no mcporter instance is registered for this server yet. The first shaping decision is therefore whether this item extends that path or introduces a second mechanism; extending it is the cheaper route and avoids two competing definitions of "integration test".

The known dependencies are a disposable Google account with consent granted across `GSUITE_DEFAULT_SCOPES`, a token store the gated run can read, and — if the mcporter route is taken — a registered instance so `ki:generate:client` can regenerate the typed client.

The decisions still needed are which operations a live run may exercise, where credentials live locally, whether CI ever runs the gated path or only the recorded replay, and how a gated suite coexists with the 100% coverage thresholds if it is placed inside the vitest glob rather than beside it.

This item is ready for promotion once a disposable test account exists and the permitted operation set and credential handling have been decided; without a real account to point at, the work cannot be finished no matter how well it is planned.

## Discussion

### Whether the existing replay path already discharges this

`ki:test:record` and `ki:test:replay` already exercise the real API and preserve the result as a committed fixture. What they do not yet provide is meaningful coverage — one `gsuite_about` call — or a gate distinguishing "replay the fixture" from "hit the live account". It is genuinely open whether this item is a new test or an expansion of the existing script plus a documented gate.

### Blast radius of a live run

The server exposes no send tool, and the smoke test asserts that as a hard invariant, so a live run cannot email anyone. The residual risk is that label, archive, and trash operations mutate a real mailbox. That argues for a disposable account and, at minimum for a first pass, an operation set limited to reads plus a draft create-and-delete round trip that cleans up after itself.

### Where the gate lives

`INTEGRATION=1` in the Context is a shape, not a decision. A gate inside a vitest file interacts with the coverage thresholds; a gate in a separate script keeps the default suite untouched but means the live path is never type-checked by the same run. Neither has been chosen.
