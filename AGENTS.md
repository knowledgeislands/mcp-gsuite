# AGENTS.md

Engineering follows `ki-engineering`, and the server's shape follows `ki-repo-mcp`: its layout, configuration injection, tool naming, annotation-driven access gate and security invariants, and where README and this file each hold what.

Repository-specific implementation guidance follows. User-facing setup and tool documentation live in [README.md](./README.md) and [docs/guides/](./docs/guides/README.md).

## OAuth and data safety

Never log or return access or refresh tokens. Preserve atomic `0600` token storage, exact single-use OAuth state validation, strict redirect and provider URL validation, bounded attachment handling, path containment, and header-injection guards. Mutating tools expose safe defaults and tests must use isolated fixtures rather than real Google accounts, mailboxes, calendars, drives, or token stores.

## Verification

`ki:test:record` and `self:test:integration:readonly` contact Google and require explicit authority; `ki:test:replay` runs against the committed fixture. The read-only probe runs only with `INTEGRATION=1` and a dedicated `integration-oauth-tokens.json`, never the server's own token store.

`bun run ki:test:smoke` boots the server over stdio and asserts the wire-level tool surface matches `EXPECTED_TOOLS` in [scripts/smoke.ts](./scripts/smoke.ts) — keep that list in sync when adding or removing tools, alongside [src/tool-registration.test.ts](./src/tool-registration.test.ts).

In production `MCP_GSUITE_CLIENT_ID` / `MCP_GSUITE_CLIENT_SECRET` come from the MCP client's `env` block or the package's `.env.local` or `.env`.

## Architecture Invariants

This server targets MCP specification revision **2026-07-28**, selected by the `@modelcontextprotocol/server` major 2 runtime dependency. Three consequences bind anything you write here:

- Every synchronous result helper in [src/utils/results.ts](./src/utils/results.ts) stamps `resultType: 'complete'`. A new helper that omits it produces a wire-level failure, not a visible one at the call site.
- [src/mcp-server/index.ts](./src/mcp-server/index.ts) hands `serveStdio` a `createServer` **factory**, not an instance. Registration must be complete before the factory returns and must never depend on connection state.
- `serveStdio` is configured `legacy: 'serve'`, a deliberate fallback that keeps a 2025-era client working while the fleet migrates. `bun run ki:test:smoke` asserts both eras, so removing the fallback fails a gate rather than silently dropping clients.

### Configuration and layers

- **[src/config/index.ts](./src/config/index.ts)** — exports `SERVER_NAME`, `SERVER_VERSION`, `GSUITE_DEFAULT_SCOPES` and `DEFAULT_SEARCH_RESULTS` beside the standard constants. The OAuth/token vars are grouped under `config.auth` (an `AuthConfig`).
- **[src/mcp-server/index.ts](./src/mcp-server/index.ts)** — keep the startup logging, which warns when the client id or secret is unset.
- **[src/auth-server/index.ts](./src/auth-server/index.ts)** — the standalone OAuth callback server, its own top-level entry. Also calls `loadConfig()` once and uses `config.auth`.
- **[src/main/](./src/main/)** — `main/auth/` (OAuth client + token store), `main/google-client/` (the shared authorized client and the `gmailService`, `calendarService`, `driveService` and `sheetsService` factories, each taking `cfg.auth`), `main/email/parse.ts` (Gmail payload parsing helpers), `main/drive-client/` and `main/sheets-client/` (the `drive` tool group), `main/integration-readonly/` (the gated read-only probe), and `main/{labels,filters,history,messages,threads,drafts,attachments,calendar,auth-info}/`. No hidden state: the cached OAuth client in `main/auth` is the one process-lifetime exception, with `resetAuthClient()` to clear it; the cached authenticated email in `main/drafts` has `_resetAuthEmailCacheForTests()`.
- **[src/utils/](./src/utils/)** — `assertOutputPathWithinDownloadRoot(downloadRoot, …)` takes its primitive; `utils/audit-log.ts` differs from its siblings only in `SERVER_NAME` and its Google-specific `REDACT_FIELDS` set. `utils/schemas.ts` holds the bounded id, query and text schemas.

To use the code from a script: `const cfg = loadConfig(); await listLabels(cfg)`.

This dependency direction is enforced, not just described: [.dependency-cruiser.ts](./.dependency-cruiser.ts) states each boundary as a named rule and [src/boundaries.test.ts](./src/boundaries.test.ts) cruises the source graph and proves every rule still rejects a deliberate crossing. The checker runs from its own install root, `tooling/depcruise`, because dependency-cruiser needs a TypeScript below 7.

### Two processes

- `mcp-gsuite` — the stdio MCP server (entry: `dist/mcp-server/index.js`).
- `mcp-gsuite-auth` — long-running OAuth callback server on `MCP_GSUITE_AUTH_PORT`, default `:3334` (entry: `dist/auth-server/index.js`). Must be up to complete the `gsuite_auth_start` flow.

### Tool surface and access levels

The `<app>` prefix is `gsuite`. The auth tools (`gsuite_about`, `gsuite_auth_start`, `gsuite_auth_status`) are server-level metadata and drop the resource segment.

`MCP_GSUITE_ACCESS_LEVEL` defaults to `read`. `write` adds draft creation, update and forwarding, label and filter creation, calendar and sheet updates, `gsuite_email_message_raw` and `gsuite_email_attachment_save` (each writes a new file to disk, never overwriting), and the message and thread modifications, trash among them, which are idempotent and recoverable; `destructive` adds only the deletes (`gsuite_calendar_event_delete`, `gsuite_email_draft_delete`, `gsuite_email_filter_delete`, `gsuite_email_label_delete`). The presets in [src/utils/annotations.ts](./src/utils/annotations.ts) are `READ_ONLY` (the local auth tools), `READ_ONLY_REMOTE`, `WRITE_REMOTE`, `WRITE_IDEMPOTENT_REMOTE` and `DESTRUCTIVE_REMOTE`.

## Security Requirements

This server holds OAuth refresh tokens that grant the combined `GSUITE_DEFAULT_SCOPES` — `gmail.modify` (read/send/label/trash), `gmail.settings.basic` (filters), `calendar`, `drive.readonly` and `spreadsheets` — unless `MCP_GSUITE_SCOPES` overrides them. Token leakage = full mailbox, calendar and spreadsheet compromise, and read access to Drive. New tools and changes to existing tools MUST preserve every invariant below.

1. **Tokens are never logged.** No `console.log`/`console.error` of token values, refresh tokens, or any object that contains them. [src/main/auth/index.ts](./src/main/auth/index.ts) follows this; `gsuite_auth_status` returns `redactedTokenSummary(cfg.auth)` (presence + scope + expiry only). No other tool may return token material.
2. **Token persistence is atomic and `0600`.** `atomicWrite()` writes to `<path>.tmp.<pid>.<rand>` then `fs.renameSync` into place; both temp and final files use `mode: 0o600`. Refresh persistence goes through the same path via the `googleapis` `tokens` event listener — keep it that way.
3. **Refresh-token preservation on refresh.** Google omits `refresh_token` on most refresh responses. The persist handler merges with the existing on-disk token (`{...tokens, ...refreshed}`) so the long-lived refresh token survives.
4. **Caller-provided filesystem paths are confined to `MCP_GSUITE_DOWNLOAD_PATH`.** Both the WRITE side — tools that write fetched bytes to disk (`gsuite_email_message_raw`, `gsuite_email_attachment_save`) — and the READ side — draft attachments read off disk in `readAttachments` (`gsuite_email_draft_create` / `gsuite_email_draft_update`) — validate via `assertOutputPathWithinDownloadRoot()` in [src/utils/paths.ts](./src/utils/paths.ts) before any `fs.*` read/write or API call. The READ side matters as much as the WRITE side: an unguarded attachment read is an arbitrary-host-file exfiltration vector (any readable file becomes a draft attachment).
5. **`gsuite_email_attachment_get` is inline only, capped at `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES`** (default 256 KiB decoded), and stays at `read`; writing to disk is `gsuite_email_attachment_save`'s alone, at `write`. The get handler bails on the metadata lookup when `meta.size` exceeds the cap (no bytes fetch), and re-checks post-fetch as defence in depth.
6. **Header-injection guards must stay in [src/utils/mime.ts](./src/utils/mime.ts).** `buildRfc2822` rejects newlines in recipient/subject inputs. New mail-construction tools must reuse this builder, not handcraft headers.
7. **401 hint surfaces remediation.** `errMessage()` in [src/utils/errors.ts](./src/utils/errors.ts) appends `AUTH_HINT` on 401: re-authenticate with `gsuite_auth_start`, including the `write` access-level change and client restart a read-level caller needs to reach it. New tools must use `errorResult(action, err)` so this contract holds.
8. **No shell-out.** This server doesn't spawn processes.
9. **Mail changes pass the protected list.** Every handler that changes a message, thread, label or filter calls `guardWrite()` from [src/main/protected/index.ts](./src/main/protected/index.ts) before its Gmail write, naming every target, and returns its refusal unchanged. The server reads a target's labels itself rather than trusting the caller; a batch is refused whole; there is no override argument. A new mail-changing tool joins the guard and its tests in [src/main/protected/index.test.ts](./src/main/protected/index.test.ts).

**RFC 8707 `resource`/`aud` and Client ID Metadata Documents are deliberately N/A here.** This is a stdio loopback server: it is an OAuth _client_ of Google (which scopes tokens by `scope`, not RFC 8707 `resource`), not a remote HTTP OAuth _resource server_ or _authorization server_, and no bearer token crosses the stdio boundary. Per workspace MCP standard §14 (OAuth security) items 7–8, those protections govern roles this server does not occupy, so there is nothing to implement; the live token-passthrough defense is §14 item 1 (we only ever use tokens issued to ourselves). Revisit only if this server is ever deployed as a remote HTTP resource/authorization server.

Atomic-write, mode-0600, redacted summary, and refresh-token preservation tests live in [src/main/auth/index.test.ts](./src/main/auth/index.test.ts); header-injection rejection in [src/utils/mime.test.ts](./src/utils/mime.test.ts).

## Tool registration call sites

Each `<group>` declares its tools in `src/tools/<group>/index.ts` (`auth`, `labels`, `filters`, `history`, `messages`, `attachments`, `threads`, `drive`, `calendar`, `drafts`) as thin defs that call into `src/main/`. The `auth` group's implementation lives in `src/main/auth-info/`, distinct from the OAuth client in `src/main/auth/`, and the `drive` group's in `src/main/drive-client/` and `src/main/sheets-client/`. To survey the surface, `grep "registerTool" src/tools/*/index.ts`. The per-tool logic and its tests are co-located in `src/main/`. README's [Available Tools](./README.md#available-tools) tabulates them with purposes.
