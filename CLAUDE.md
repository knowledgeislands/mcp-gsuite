# CLAUDE.md

Guidance for Claude Code when working in this repo. The user-facing tool surface, OAuth setup, install/config, and Claude Desktop setup live in [README.md](./README.md); this file covers what Claude needs that isn't in README and isn't derivable from one grep.

## Bun vs Node

This project uses Bun (≥ 1.3) for install and dev scripts, but the compiled `dist/` runs under Node (≥ 22) — that's what Claude Desktop launches.

- `bun run test` (NOT `bun test` — the latter invokes Bun's own runner instead of vitest).
- Bun auto-loads `.env.${NODE_ENV}` from the CWD; Node needs the explicit `process.loadEnvFile()` call inside `loadConfig()` in [src/config/index.ts](./src/config/index.ts). The try/catch swallows the `TypeError` Bun raises (no `process.loadEnvFile`), so the same code works under both.
- `NODE_ENV` is set to `development` only by `server:*:dev` and `ki:server:mcp:inspect`. Claude Desktop doesn't set it, so `.env.*` is ignored in production — `MCP_GSUITE_CLIENT_ID` / `MCP_GSUITE_CLIENT_SECRET` must come from the Claude Desktop config `env` block.

Run `bun run` with no args for the full script list. `bun run ki:test:smoke` boots the server over stdio and asserts the wire-level tool surface matches `EXPECTED_TOOLS` in [scripts/smoke.ts](./scripts/smoke.ts) — keep that list in sync when adding or removing tools, alongside [src/tool-registration.test.ts](./src/tool-registration.test.ts).

## Architecture Invariants

This server targets MCP specification revision **2025-11-25**.

### Project layout & config injection (the workspace MCP shape)

This is the canonical layout we roll out across the MCPs:

- **[src/config/index.ts](./src/config/index.ts)** — `loadConfig(env?) → Config`. Reads env (optionally hydrated from `.env.${NODE_ENV}`) into a plain `Config` value. **There is no module-level config singleton — nothing reads env at import time.** Exported constants (`SERVER_NAME`, `SERVER_VERSION`, `ACCESS_LEVELS`, `ACCESS_LEVEL_RANK`, `DEFAULT_SEARCH_RESULTS`) and types (`Config`, `AuthConfig`, `AccessLevel`, `AuditLogMode`) live here too. The OAuth/token vars are grouped under `config.auth` (an `AuthConfig`).
- **[src/mcp-server/index.ts](./src/mcp-server/index.ts)** — the stdio MCP wrapper. Calls `loadConfig()` once, builds the `AuditConfig` from it, installs `makeAccessGatedRegister(server, config.accessLevel, audit)`, and threads the `Config` into every `registerXxxTools(server, config)`. Keep the startup logging.
- **[src/auth-server/index.ts](./src/auth-server/index.ts)** — the standalone OAuth callback server, its own top-level entry. Also calls `loadConfig()` once and uses `config.auth`.
- **[src/tools/](./src/tools/)** — MCP tool definitions only. Thin: each `registerXxxTools(server, cfg)` declares the schema/annotations and hands `(args) => mainFn(cfg, args)` to `server.registerTool`. Excluded from coverage.
- **[src/main/](./src/main/)** — the real implementation, usable outside the MCP server (e.g. from a script). Grouped by concern: `main/auth/` (OAuth client + token store), `main/google-client/` (the shared authorized client + per-API service factories: gmail today; calendar/drive/sheets seams ready), `main/email/parse.ts` (Gmail payload parsing helpers), and `main/{labels,messages,threads,drafts,attachments,auth-info}/` (one function per tool). Every `main` entry point takes its config slice as its **first argument** — `listLabels(cfg)`, `gmailService(cfg.auth)`. No hidden state (the cached OAuth client in `main/auth` is the one process-lifetime exception, with `resetAuthClient()` to clear it; the cached authenticated email in `main/drafts` has `_resetAuthEmailCacheForTests()`).
- **[src/utils/](./src/utils/)** — cross-MCP reusable helpers; keep in sync with sibling repos. These take the **specific config primitive** they need (`assertOutputPathWithinDownloadRoot(downloadRoot, …)`, `withAuditLog(auditConfig, …)`, `makeAccessGatedRegister(server, accessLevel, audit)`), not the whole `Config`, so they stay MCP-agnostic. `utils/access-level.ts` and `utils/audit-log.ts` are the parameterized versions shared verbatim with the sibling repos (only the `SERVER_NAME` constant and the gmail-specific `REDACT_FIELDS` set differ).

To use the code from a script: `const cfg = loadConfig(); await listLabels(cfg)`.

### Two processes

- `mcp-gsuite` — the stdio MCP server (entry: `dist/mcp-server/index.js`).
- `mcp-gsuite-auth` — long-running OAuth callback server on `:3334` (entry: `dist/auth-server/index.js`). Must be up to complete the `gsuite_auth_start` flow.

### Naming convention

Tool names follow `<app>_<resource>_<action>` (snake_case) with `<app>` = `gmail`. Plural resource for collection ops, singular for single-item ops. The auth tools (`gsuite_about`, `gsuite_auth_start`, `gsuite_auth_status`) are server-level metadata and drop the resource segment.

### Access-level gate — driven by annotations, not names

[src/utils/access-level.ts](./src/utils/access-level.ts) `makeAccessGatedRegister(server, accessLevel, audit)` decides at startup whether to register each tool, based on the tool's `annotations`:

- `readOnlyHint: true` → `read`
- `destructiveHint: true` → `destructive`
- explicit `readOnlyHint: false` AND `destructiveHint: false` → `write` (non-destructive mutation — e.g. send, draft create)
- anything else (unannotated / partially annotated) → `destructive` (fail-safe)

A tool registers when its derived level is at or below `config.accessLevel` (from `MCP_GSUITE_ACCESS_LEVEL`, default: `read`). Levels nest: `read` registers only readers; `write` adds non-destructive mutations like `gsuite_email_draft_create`; `destructive` adds delete/trash. New tools MUST set `annotations` to one of the presets in [src/utils/annotations.ts](./src/utils/annotations.ts) — `READ_ONLY_REMOTE` for reads, `WRITE_REMOTE`/`WRITE_IDEMPOTENT_REMOTE` for non-destructive writes, `DESTRUCTIVE_REMOTE` for deletes. Do not bypass the proxy.

## Security Requirements

This server holds OAuth refresh tokens that grant the combined `GSUITE_DEFAULT_SCOPES` — `gmail.modify` (read/send/label/trash), `calendar`, `drive.readonly`, and `spreadsheets`. Token leakage = full mailbox, calendar, and drive-read compromise. New tools and changes to existing tools MUST preserve every invariant below.

1. **Tokens are never logged.** No `console.log`/`console.error` of token values, refresh tokens, or any object that contains them. [src/main/auth/index.ts](./src/main/auth/index.ts) follows this; `gsuite_auth_status` returns `redactedTokenSummary(cfg.auth)` (presence + scope + expiry only). No other tool may return token material.
2. **Token persistence is atomic and `0600`.** `atomicWrite()` writes to `<path>.tmp.<pid>.<rand>` then `fs.renameSync` into place; both temp and final files use `mode: 0o600`. Refresh persistence goes through the same path via the `googleapis` `tokens` event listener — keep it that way.
3. **Refresh-token preservation on refresh.** Google omits `refresh_token` on most refresh responses. The persist handler merges with the existing on-disk token (`{...tokens, ...refreshed}`) so the long-lived refresh token survives.
4. **All Zod schemas are `.strict()` with bounded numerics.** Already true; new schemas must continue this (e.g. `z.number().int().positive().max(500)` for `maxResults`).
5. **Caller-provided filesystem paths are confined to `MCP_GSUITE_DOWNLOAD_PATH`.** Both the WRITE side — tools that write fetched bytes to disk (`gsuite_email_message_raw`, `gsuite_email_attachment_get` with `outputPath`) — and the READ side — draft attachments read off disk in `readAttachments` (`gsuite_email_draft_create` / `gsuite_email_draft_update`) — validate via `assertOutputPathWithinDownloadRoot()` in [src/utils/paths.ts](./src/utils/paths.ts), the same lexical + symlink (realpath) guard against the same root, before any `fs.*` read/write or API call. The READ side matters as much as the WRITE side: an unguarded attachment read is an arbitrary-host-file exfiltration vector (any readable file becomes a draft attachment).
6. **Inline `gsuite_email_attachment_get` responses are capped at `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES`** (default 256 KiB decoded). The handler bails on the metadata lookup when `meta.size` exceeds the cap (no bytes fetch), and re-checks post-fetch as defence in depth.
7. **Header-injection guards must stay in [src/utils/mime.ts](./src/utils/mime.ts).** `buildRfc2822` rejects newlines in recipient/subject inputs. New mail-construction tools must reuse this builder, not handcraft headers.
8. **401 hint surfaces remediation.** `errMessage()` in [src/utils/errors.ts](./src/utils/errors.ts) appends ``Run the `gsuite_auth_start` tool to refresh the OAuth token.`` on 401. New tools must use `errorResult(action, err)` so this contract holds.
9. **No shell-string interpolation.** This server doesn't shell out. If a future tool needs to, use `execFile` with an argv array.

**RFC 8707 `resource`/`aud` and Client ID Metadata Documents are deliberately N/A here.** This is a stdio loopback server: it is an OAuth _client_ of Google (which scopes tokens by `scope`, not RFC 8707 `resource`), not a remote HTTP OAuth _resource server_ or _authorization server_, and no bearer token crosses the stdio boundary. Per workspace MCP standard §13 items 7–8, those protections govern roles this server does not occupy, so there is nothing to implement; the live token-passthrough defense is invariant #1 (we only ever use tokens issued to ourselves). Revisit only if this server is ever deployed as a remote HTTP resource/authorization server.

Atomic-write, mode-0600, redacted summary, and refresh-token preservation tests live in [src/main/auth/index.test.ts](./src/main/auth/index.test.ts); header-injection rejection in [src/utils/mime.test.ts](./src/utils/mime.test.ts).

## Tool registration call sites

Each `<group>` declares its tools in `src/tools/<group>/index.ts` (`auth`, `labels`, `messages`, `attachments`, `threads`, `drafts`) as thin defs that call into `src/main/<group>/index.ts` (note: the `auth` tool group's implementation lives in `src/main/auth-info/`, distinct from the OAuth client in `src/main/auth/`). To survey the surface, `grep "registerTool" src/tools/*/index.ts`. The per-tool logic and its tests are co-located in `src/main/`. README's [Available Tools](./README.md#available-tools) tabulates them with purposes.
