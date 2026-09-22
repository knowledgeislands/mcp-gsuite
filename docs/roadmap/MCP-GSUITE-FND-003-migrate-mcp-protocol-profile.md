---
id: MCP-GSUITE-FND-003
area: FND
title: Migrate MCP protocol profile
theme: foundation-tooling
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-02T01:12:46Z
updated_at: 2026-09-22T06:54:14Z
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

- [ ] Replace the runtime dependency `@modelcontextprotocol/sdk` with `@modelcontextprotocol/server` 2.0.0 and add `@modelcontextprotocol/client` 2.0.0 as a development dependency, both exact-pinned as the pilot pins them.
- [ ] Re-point every `McpServer` and `ToolAnnotations` type import at `@modelcontextprotocol/server`, leaving the registration call shape and every tool definition untouched.
- [ ] Rewrite `src/mcp-server/index.ts` around a `createServer` factory passed to `serveStdio`, retaining the existing startup diagnostics, the access-gated register wrapper, and all eight `register*Tools` calls, and adding a SIGINT handler that closes the returned handle.
- [ ] Set `legacy: 'serve'` on `serveStdio` as the deliberate compatibility fallback, and record in this repository why it is retained rather than set to `reject`.
- [ ] Add `resultType: 'complete'` to `textResult`, `jsonResult`, and `errorResult`, and extend `src/utils/results.test.ts` to assert the discriminator on each.
- [ ] Rewrite `scripts/smoke.ts` on the v2 client: assert the modern era, the negotiated `2026-07-28` version, and a `complete` `server/discover` result naming this server; keep the existing forty-two-tool surface and no-`send`-tool assertions; add a malformed-argument call that must come back as an error envelope; and connect a second, legacy-era client that must still see the same tool surface.
- [ ] Decide the `zod` hold: lift the pin if the modern server package accepts a current `zod`, and remove the now-stale `dependency_holds` entry from `.ki.toml` either way.
- [ ] Run every declared gate and the full `ki repo audit`, and repair anything they report.

## Files touched

`package.json`, `bun.lock`, `.ki.toml`, `src/mcp-server/index.ts`, `src/utils/access-level.ts`, `src/utils/results.ts`, `src/utils/results.test.ts`, `src/tool-registration.test.ts`, `src/tools/{attachments,auth,calendar,drafts,drive,labels,messages,threads}/index.ts`, `src/tools/{calendar,drive}/index.test.ts`, `scripts/smoke.ts`.

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

No human guidance changes. `README.md` documents configuration and the tool surface, neither of which moves. `MCP-GSUITE-FND-006` is separately restructuring guidance and owns any prose change there.

### Roadmap

No further roadmap change is expected from this item alone. If the migration exposes a client that genuinely depends on the legacy era, retiring `legacy: 'serve'` becomes its own item raised with that evidence.

## Discussion

### Source evidence

The portable profile and rubric live in ki-repo-mcp; the accepted mcp-git-audit migration is implementation evidence, not a patch to copy mechanically. Receiver-specific authentication, configuration, generated client, and tool-envelope differences remain local design inputs.

### Acceptance boundary

The modern profile is not claimed until this repository's package, result helpers, stdio entry point, focused tests, live smoke, and ki-repo-mcp audit agree. A passing legacy audit before migration remains expected.

### Horizon

Shaping anticipated a promotion to `Next`. The same approval that reviewed the dependency delta, entry-point change, compatibility boundary, and smoke assertions against this repository's source also selected the item for immediate execution, so it went to `Now` directly rather than resting a queue position it would leave in the same operation.

### Compatibility fallback

`legacy: 'serve'` is a deliberate retention, not a default left unread. The alternative, `reject`, answers a 2025-era opening with an unsupported-protocol-version error, which would break any client still speaking the legacy handshake for no benefit to this repository while the fleet migrates. Retaining it costs a second pinned instance per legacy connection and nothing else, and the server remains a modern-profile server either way. The smoke test asserts the fallback still works so its removal cannot happen silently.
