---
id: MCP-GSUITE-FND-003
area: FND
title: Migrate MCP protocol profile
theme: foundation-tooling
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: f32e575f6312e4c618fd945af7070a129b51f02a
created_at: 2026-09-02T01:12:46Z
updated_at: 2026-09-22T07:04:30Z
---

## Goal

Move mcp-gsuite to the supported MCP 2026-07-28 server profile without breaking its existing tool surface or legacy clients.

## Context

The Harness KI-HARNESS-GOV-006 rollout now derives protocol applicability from the runtime dependency. This repository still declares @modelcontextprotocol/sdk major 1 and remains conformant to the legacy 2025-11-25 profile. The accepted mcp-git-audit pilot proves the modern package family, per-connection stdio factory, SDK-owned discovery, complete result envelopes, smoke boundary, and deliberate compatibility fallback.

## Boundary

Do not change the public tool contract, remove legacy compatibility without evidence, or treat the Harness rollout as receiver acceptance. This record captures receiver-owned migration work only; prioritisation, implementation, verification, acceptance, release, and publication remain in this repository.

## Shaping

Adopt the accepted pilot as the first comparison baseline: move to the v2 server package family, replace the legacy stdio transport with a per-connection serveStdio factory, add resultType: "complete" to synchronous result helpers, retain deliberate legacy fallback, and prove SDK-owned discovery through the repository smoke boundary.

Promote to Next when the exact dependency delta, entry-point change, compatibility boundary, and receiver-specific smoke assertions are reviewed against this repository's current source.

## Current state

`package.json` declares `@modelcontextprotocol/sdk: ^1.30.0` as a runtime dependency, which selects the legacy MCP 2025-11-25 profile. Twelve source files import from it: `src/mcp-server/index.ts` imports `McpServer` and `StdioServerTransport` as values, `src/utils/access-level.ts` imports the `McpServer` and `ToolAnnotations` types, eight `src/tools/*/index.ts` files and two of their tests import the `McpServer` type, and `scripts/smoke.ts` imports the legacy `Client` and `StdioClientTransport`.

The entry point constructs a single module-scope `McpServer`, registers all forty-two tools onto it, and connects one `StdioServerTransport` in a `main()` function. There is no server factory, so a connection cannot be served from a fresh instance and there is no era decision to make.

`src/utils/results.ts` exports `textResult`, `jsonResult`, and `errorResult`. All three are synchronous and none carries `resultType: "complete"`; every tool result in the repository flows through them, and nothing else in `src/` builds a `content` envelope inline.

`scripts/smoke.ts` proves the tool surface over the wire and asserts the repository's hard invariant that no `send` tool exists, but it asserts nothing about the protocol era, the negotiated version, or `server/discover`, because the legacy client cannot express those. `.ki.toml` records a `dependency_holds` entry pinning `zod` to `4.4.3` because 4.5.4 and later are incompatible with `@modelcontextprotocol/sdk` 1.30.0 schema types; that hold names a package this item removes.

Every gate is green on the legacy profile at the baseline: build, `tsc --noEmit`, Biome, knip, 466 tests across 21 files, the live smoke test, and `ki repo audit` at 15 skills.

## Steps

- [x] Replace the runtime dependency `@modelcontextprotocol/sdk` with `@modelcontextprotocol/server` 2.0.0 and add `@modelcontextprotocol/client` 2.0.0 as a development dependency, both exact-pinned as the pilot pins them.
- [x] Re-point every `McpServer` and `ToolAnnotations` type import at `@modelcontextprotocol/server`, leaving the registration call shape and every tool definition untouched.
- [x] Rewrite `src/mcp-server/index.ts` around a `createServer` factory passed to `serveStdio`, retaining the existing startup diagnostics, the access-gated register wrapper, and all eight `register*Tools` calls, and adding a SIGINT handler that closes the returned handle.
- [x] Set `legacy: 'serve'` on `serveStdio` as the deliberate compatibility fallback, and record in this repository why it is retained rather than set to `reject`.
- [x] Add `resultType: 'complete'` to `textResult`, `jsonResult`, and `errorResult`, and extend `src/utils/results.test.ts` to assert the discriminator on each.
- [x] Rewrite `scripts/smoke.ts` on the v2 client: assert the modern era, the negotiated `2026-07-28` version, and a `complete` `server/discover` result naming this server; keep the existing forty-two-tool surface and no-`send`-tool assertions; add a malformed-argument call that must come back as an error envelope; and connect a second, legacy-era client that must still see the same tool surface.
- [x] Decide the `zod` hold: lift the pin if the modern server package accepts a current `zod`, and remove the now-stale `dependency_holds` entry from `.ki.toml` either way.
- [x] Run every declared gate and the full `ki repo audit`, and repair anything they report.

## Files touched

`package.json`, `bun.lock`, `.ki.toml`, `CLAUDE.md`, `src/mcp-server/index.ts`, `src/utils/access-level.ts`, `src/utils/results.ts`, `src/utils/results.test.ts`, `src/tool-registration.test.ts`, `src/tools/{attachments,auth,calendar,drafts,drive,labels,messages,threads}/index.ts`, `src/tools/{calendar,drive}/index.test.ts`, `scripts/smoke.ts`.

No file under `src/main/` changes: the handlers keep returning the helper envelopes, so the behaviour behind the tool surface is untouched.

## Verify

`bun run build`, `bunx tsc --noEmit`, `bunx @biomejs/biome check .`, `bunx knip`, `bun run test`, `bun run test:coverage` (100% thresholds), and `bun run ki:test:smoke` all pass. `ki repo audit --concise --progress never` still passes at 15 skills, and the tool surface the smoke test observes is the same forty-two names as at the baseline.

## Dependencies / blocks

Nothing blocks this. `KI-HARNESS-GOV-006` in `ki-agentic-harness` made protocol applicability derive from the runtime dependency, which is what makes this item meaningful, but the Harness rollout is not receiver acceptance and does not gate the work here.

`mcp-git-audit` is the accepted pilot and the comparison baseline. It is read-only evidence for this item; nothing in this repository waits on it.

`MCP-GSUITE-FND-004` reviews conformance audit coverage and `MCP-GSUITE-FND-002` adds a gated live API test. Neither blocks this item nor is blocked by it, though both become easier to judge once the profile is settled.

## Documentation impact

### Decision Records

No decision record is needed. The modern profile is the house standard that `ki-repo-mcp` already encodes and `mcp-git-audit` has already established by an accepted pilot, so adopting it here is conformance rather than a new decision. One becomes owed only if this repository decides to keep the legacy fallback permanently or to diverge from the profile.

### Specifications

No behaviour-level contract changes. The forty-two tool names, their input schemas, their output schemas, and their annotations are all unchanged; the smoke test asserts that surface before and after. The `resultType` discriminator is a wire-level field the SDK owns, not part of the tool contract a caller writes against.

### Guides

No reader-facing guidance changes. `README.md` documents configuration and the tool surface, neither of which moves, and `MCP-GSUITE-FND-006` is separately restructuring guidance and owns any prose change there.

`CLAUDE.md` is contributor instruction rather than a guide, and it does change: it asserted the 2025-11-25 revision, which this item makes false, so it now names 2026-07-28 and records the constraints the profile places on future code.

### Roadmap

No further roadmap change is expected from this item alone. If the migration exposes a client that genuinely depends on the legacy era, retiring `legacy: 'serve'` becomes its own item raised with that evidence.

## Review

### Delivered

The approved boundary held: the public tool contract is unchanged, legacy compatibility was retained rather than removed, and nothing here treats the Harness rollout as acceptance. Prioritisation, verification, and the delivered evidence are this repository's; acceptance, release, and publication remain outside this item.

Immutable baseline: `f32e575f6312e4c618fd945af7070a129b51f02a`.

The resulting evidence is the live smoke boundary. It reports `modern discovery, legacy fallback, 42 tools listed, no send_* tools, all schemas present` — the same forty-two tool names observed at the baseline, now reached over a negotiated `2026-07-28` connection, with a second client proving the 2025-era handshake still works.

Excluded, deliberately: no change to any file under `src/main/`, no change to any tool name, input schema, output schema, or annotation, and no `CHANGELOG.md` entry. The changelog carries a single `[Unreleased]` line and this repository has never released, so a `Changed` entry would describe a difference no consumer can observe.

### Summary of changes

`package.json` and `bun.lock` drop `@modelcontextprotocol/sdk` `^1.30.0` and gain `@modelcontextprotocol/server` `2.0.0` as a runtime dependency plus `@modelcontextprotocol/client` `2.0.0` as a development dependency. The dependency is the whole profile switch: nothing else claims a protocol revision.

`src/mcp-server/index.ts` is rebuilt around a `createServer` factory handed to `serveStdio`, replacing the single module-scope instance and its one `StdioServerTransport`. Startup diagnostics, the access-gated register wrapper, and all eight `register*Tools` calls are unchanged in content and order; a SIGINT handler now closes the returned handle.

`src/utils/access-level.ts` takes both `McpServer` and `ToolAnnotations` from `@modelcontextprotocol/server`; eight `src/tools/*/index.ts` files, `src/tool-registration.test.ts`, and two tool tests re-point their `McpServer` type import. No registration call shape changed, which is why the tool surface could not move.

`src/utils/results.ts` stamps `resultType: 'complete'` on `textResult`, `jsonResult`, and `errorResult`; `src/utils/results.test.ts` gains an assertion per helper. Every tool result in the repository flows through these three, and nothing builds a `content` envelope inline, so this covers the whole surface.

`scripts/smoke.ts` moves to the v2 client and now asserts the modern era, the negotiated `2026-07-28` version, and a `complete` `server/discover` result naming `mcp-gsuite`; a malformed `gsuite_email_message_get` argument that must return an error envelope rather than a protocol error; and a second legacy-era client that must see an identical tool surface. The existing forty-two-name expectation and the no-`send`-tool invariant are retained verbatim.

Two decisions beyond the literal step list, both inside the item's boundary:

- **`zod` unpinned from `4.4.3` to `^4.6.5`, and the `dependency_holds` entry removed from `.ki.toml`.** The hold existed only because `zod` 4.5.4 and later were incompatible with `@modelcontextprotocol/sdk` 1.30.0 schema types, and that package is gone. Leaving the hold would have named a dependency the repository no longer has. The bump was verified rather than assumed: typecheck, all 469 tests, and the live smoke test pass on `zod` 4.6.5, which is also what the accepted pilot runs.
- **`CLAUDE.md` updated.** It asserted `This server targets MCP specification revision 2025-11-25`, which the migration made false. It now names `2026-07-28`, states that the runtime dependency is the selector, and records the three constraints that bind future contributors: the `resultType` stamp on every helper, the factory-not-instance contract, and why `legacy: 'serve'` is retained. The project-layout bullet for the entry point was corrected to describe the factory. `CLAUDE.md` was not in the planned file list; it is added to `Files touched` above.

### Verification

Every gate below was run from the repository root after the final change.

- `bun run build` — pass, no diagnostics.
- `bunx tsc --noEmit -p tsconfig.json` — pass, no output.
- `bunx @biomejs/biome check .` — pass: `Checked 62 files in 83ms. No fixes applied. Found 1 info.` The one info is the pre-existing Biome configuration-version notice, unchanged from the baseline.
- `bunx knip` — pass: configuration hints only, the same six as the baseline.
- `bunx syncpack lint` — pass: `✓ No issues found`.
- `bun run test` — pass: `Test Files 21 passed (21)`, `Tests 469 passed (469)`, up from 466 by the three new `resultType` assertions.
- `bun run test:coverage` — pass: statements 896/896, branches 612/612, functions 146/146, lines 795/795, all at the configured 100% thresholds.
- `bun run ki:test:smoke` — pass: `✓ smoke passed: modern discovery, legacy fallback, 42 tools listed, no send_* tools, all schemas present`.
- `ki repo audit --concise --progress never` — pass: `summary: KI REPO AUDIT on mcp-gsuite PASS · 15 skills`, matching the baseline count.

### Outstanding concerns

One test run, the first executed after the dependency swap, reported `1 failed | 468 passed` without naming the failing case in captured output. It did not reproduce: ten consecutive full runs and two coverage runs since have all reported 21 files and 469 tests passing, including a deliberate rebuild-then-test repeat of the exact sequence. It is recorded because it happened, not because it is believed to be real; there is no evidence of a flaky assertion and nothing was changed in response.

The provenance comments in `src/tools/*/index.ts` still cite `spec 2025-11-25 SHOULD` as the origin of the `outputSchema` recommendation. That citation remains historically accurate and no gate objects, so it was left alone rather than churned across eight files; a reader should not read it as the revision this server now targets, which `CLAUDE.md` states.

Nothing else is unresolved, unchecked, or failing.

### Post-change review

**Goal.** Met. The server runs the MCP 2026-07-28 profile because it depends on `@modelcontextprotocol/server` major 2, and the smoke test proves that live rather than by inspection. The existing tool surface is intact and legacy clients still connect.

**Scope.** Held. The two decisions beyond the literal step list are both recorded above, both were verified rather than assumed, and neither touches behaviour. No file under `src/main/` changed.

**Regression risk.** Low but not nil. The tool surface, its schemas, and its annotations are asserted identical over the wire, and 100% coverage of `src/main/` is unchanged, so handler behaviour is well fenced. The residual risk sits in two places the local gates cannot reach: the per-connection factory now builds a server instance per connection rather than sharing one, which changes nothing observable for the single-connection stdio clients this server has but is a genuine behavioural difference; and `zod` moved three minor versions, verified against this repository's schemas but not against any consumer's. The `legacy: 'serve'` fallback is what keeps the blast radius small for clients that have not migrated.

**Acceptance readiness.** Ready. Every declared gate passes, the evidence above is reproducible from the repository, and the one anomaly is disclosed rather than smoothed over. A reviewer should weigh the `zod` bump and the `CLAUDE.md` rewrite as the two judgement calls, and confirm that retaining `legacy: 'serve'` indefinitely is acceptable rather than something this repository wants to time-box.

### Mini recap

This item moved `mcp-gsuite` from the legacy MCP 2025-11-25 profile to the supported 2026-07-28 profile: the v2 server package replaces the v1 SDK, a per-connection `serveStdio` factory replaces the single transport, all three result helpers stamp `resultType: 'complete'`, and the smoke test now proves the era, the negotiated version, the discovery envelope, the error-envelope contract, and the retained legacy fallback. The stale `zod` hold went with the package that caused it, and `CLAUDE.md` no longer claims the old revision.

Verification is the repository's full declared gate set plus a 15-skill `ki repo audit`, all passing. The single disclosed concern is an unreproduced test failure on the first post-swap run.

Two things are worth routing as durable learning, without promoting them here. The first is that a `dependency_holds` entry outlives the dependency that justified it unless removing it is part of the migration that removes the package — worth stating wherever holds are specified. The second is that a repository instruction file can carry a protocol claim that no gate checks, so a profile migration has to grep its own documentation for the revision it is leaving; `CLAUDE.md` asserted `2025-11-25` and nothing would have failed had it been left.

## Discussion

### Source evidence

The portable profile and rubric live in ki-repo-mcp; the accepted mcp-git-audit migration is implementation evidence, not a patch to copy mechanically. Receiver-specific authentication, configuration, generated client, and tool-envelope differences remain local design inputs.

### Acceptance boundary

The modern profile is not claimed until this repository's package, result helpers, stdio entry point, focused tests, live smoke, and ki-repo-mcp audit agree. A passing legacy audit before migration remains expected.

### Horizon

Shaping anticipated a promotion to `Next`. The same approval that reviewed the dependency delta, entry-point change, compatibility boundary, and smoke assertions against this repository's source also selected the item for immediate execution, so it went to `Now` directly rather than resting a queue position it would leave in the same operation.

### Compatibility fallback

`legacy: 'serve'` is a deliberate retention, not a default left unread. The alternative, `reject`, answers a 2025-era opening with an unsupported-protocol-version error, which would break any client still speaking the legacy handshake for no benefit to this repository while the fleet migrates. Retaining it costs a second pinned instance per legacy connection and nothing else, and the server remains a modern-profile server either way. The smoke test asserts the fallback still works so its removal cannot happen silently.
