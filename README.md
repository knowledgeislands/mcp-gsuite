# mcp-gsuite

[![CI](https://github.com/knowledgeislands/mcp-gsuite/actions/workflows/ci.yml/badge.svg)](https://github.com/knowledgeislands/mcp-gsuite/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@knowledgeislands/mcp-gsuite.svg)](https://www.npmjs.com/package/@knowledgeislands/mcp-gsuite) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

An MCP (Model Context Protocol) server that connects Claude with Google Workspace. Email (Gmail) is fully implemented today; calendar and drive/sheets tools follow on the same shared client, scopes, and access gate.

## Features

- **Search and triage** — Gmail-query syntax at message + thread granularity, batch-relabel up to 1000 messages in a single API call.
- **Label management** — list/create/rename/delete user labels; toggle read/unread/archive/trash via sugar tools so callers don't have to know system-label ids.
- **Recoverable trash** — `messages.trash` / `threads.trash` only. Permanent deletion (`messages.delete` / `threads.delete`) is deliberately not exposed.
- **Drafts-only outbound** — compose plain text + HTML (with `multipart/alternative` fallback), attachments with filename/MIME-type overrides, reply + reply-all (self-dedupe via cached profile). **Never sends mail** — the user reviews drafts in Gmail and clicks Send.
- **Strict input schemas** — every tool registers a Zod schema; `tools/list` reports proper JSON Schema and honest MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

**Quality:** 420 tests at 100% coverage; CI also boots the built server over stdio MCP and asserts the wire-level tool surface on every commit ([`bun run ki:test:smoke`](#development)).

## Quick Start

1. **Install dependencies**: `bun install`.
2. **Set up Google Cloud credentials** — see [Google Cloud Console Setup](#google-cloud-console-setup).
3. **Configure environment** — copy `.env.example` to `.env.development` and add your Google OAuth credentials.
4. **Build**: `bun run build`.
5. **Configure Claude Desktop** with `dist/mcp-server/index.js` and your `MCP_GSUITE_CLIENT_ID`/`MCP_GSUITE_CLIENT_SECRET` (see [Configuration](#configuration)).
6. **Start the auth server**: `bun run ki:server:auth:dev` (separate process; handles OAuth on `localhost:3334`).
7. **Authenticate** — call the `gsuite_auth_start` tool in your MCP client, follow the URL, sign in. Tokens land at `~/.mcp-gsuite-tokens.json` (mode `0600`). (`gsuite_auth_start` is annotated `WRITE_REMOTE` because it persists tokens, so it registers at `MCP_GSUITE_ACCESS_LEVEL=write` or higher; the default `read`-only configuration hides it along with every other mutating tool.)

## Example Conversations

Concrete asks you might make of Claude with this server connected.

**Triage by sender:**

> "Find all unread emails from `notifications@github.com` from the last 30 days and archive them."

Claude uses [`gsuite_email_messages_search`](#message) with `from:notifications@github.com is:unread newer_than:30d` to collect ids, then [`gsuite_email_messages_batch_modify`](#message) (single round-trip, up to 1000 ids per call) to drop the `INBOX` label from the batch.

**Draft a contextual reply:**

> "Find the meeting invite from Alice yesterday and draft a reply confirming I'll be there at 2pm."

Claude uses `gsuite_email_messages_search` to locate the thread, `gsuite_email_message_get` to read the headers, then [`gsuite_email_draft_create`](#draft) with `replyToMessageId` set — the draft inherits `In-Reply-To`, the References chain, the threadId, and a `Re:` subject. Pass `replyAll: true` and Claude auto-populates To (= original From + To) and Cc (= original Cc); your authenticated address is dropped from both so you don't email yourself.

**Find what needs attention:**

> "Show me unread threads with attachments from this week."

Claude calls [`gsuite_email_threads_search`](#thread) with `is:unread has:attachment newer_than:7d` and returns subject, from, snippet, label ids, and attachment counts per thread — fast structured output, not free-form text.

**Bulk relabel:**

> "Move every message labelled `newsletter` from before 2026 to my `reading-list/archive` label and drop `newsletter`."

Claude resolves both label ids via [`gsuite_email_labels_list`](#label), searches with `label:newsletter before:2026/01/01`, and applies the swap in a single `gsuite_email_messages_batch_modify({addLabelIds, removeLabelIds})` call.

Filtering by a label whose name contains spaces (e.g. `Matters/Criminal - False Allegations`) needs care: Gmail's `q` operator only matches the hyphenated form (`label:Matters/Criminal---False-Allegations`), and an unquoted name with spaces silently matches nothing. Pass the exact label id(s) via the `labelIds` parameter on `gsuite_email_messages_search` / `gsuite_email_threads_search` (most reliable), or quote the name in the query (`label:"Matters/Criminal - False Allegations"`) — the server rewrites quoted names to the form Gmail expects.

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.3+ for the dev loop
- Node.js 22.0.0 or higher to run the compiled `dist/`
- A Google account for Cloud Console access

```bash
bun install
```

## Google Cloud Console Setup

### 1. Create a project

1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Project dropdown → **New Project**.
3. Name it (e.g. `mcp-gsuite`) → **Create**.

### 2. Enable the Gmail API

1. **APIs & Services → Library**.
2. Search for **Gmail API** → **Enable**.

### 3. Configure the OAuth consent screen

For brand-new projects, Google gates this behind a one-time wizard. If you see **"Google Auth Platform not configured yet"** with a **Get Started** button, follow 3a. Otherwise jump to 3b.

#### 3a. First-time setup

1. **APIs & Services → OAuth consent screen** → **Get Started**.
2. **App Information**: app name, your support email → **Next**.
3. **Audience**: **External** → **Next**.
4. **Contact Information**: your email → **Next**.
5. Agree to the user-data policy → **Continue** → **Create**.

#### 3b. Publish the app

1. **OAuth consent screen → Audience**.
2. **Publishing status** → **Publish App** → **Confirm**. (Avoids the 7-day refresh-token expiry of "Testing" mode. The app stays unverified — fine for personal use; you'll see a one-time "advanced → continue" warning during sign-in.)

#### 3c. Configure data access (scopes)

**This step is mandatory.** If a scope isn't pre-declared here, Google silently drops it from consent, and Gmail API calls return 403 even after a "successful" sign-in.

1. **OAuth consent screen → Data Access** → **Add or remove scopes**.
2. Tick each default scope: `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/spreadsheets` → **Update** → **Save**.

After changing scopes here, **delete the token file (default `~/.mcp-gsuite-tokens.json`) and re-run the `gsuite_auth_start` tool** so the consent screen prompts again with the new scope set.

### 4. Create OAuth credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
2. Application type: **Web application**.
3. Name: anything (e.g. `mcp-gsuite`).
4. **Authorized redirect URIs** → add `http://localhost:3334/auth/callback` (must match `MCP_GSUITE_REDIRECT_URI`).
5. **Create**, then copy the **Client ID** and **Client Secret**.

## Configuration

### Environment Variables

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MCP_GSUITE_CLIENT_ID` | yes | — | OAuth 2.0 Client ID (`xxxx.apps.googleusercontent.com`). |
| `MCP_GSUITE_CLIENT_SECRET` | yes | — | OAuth 2.0 Client Secret. |
| `MCP_GSUITE_REDIRECT_URI` | no | `http://localhost:3334/auth/callback` | Must match the URI registered in Google Cloud. |
| `MCP_GSUITE_SCOPES` | no | `GSUITE_DEFAULT_SCOPES` (gmail.modify + calendar + drive.readonly + spreadsheets) | Space-separated OAuth scopes. |
| `MCP_GSUITE_AUTH_PORT` | no | `3334` | Port the auth server listens on. Must match the redirect URI port. |
| `MCP_GSUITE_TOKEN_PATH` | no | `~/.mcp-gsuite-tokens.json` | Token file location. Override to keep multiple accounts side-by-side. |
| `MCP_GSUITE_ACCESS_LEVEL` | no | `read` | Maximum tool access level to register. † |
| `MCP_GSUITE_DOWNLOAD_PATH` | no | `~/Downloads` | Directory where attachment downloads are written. |
| `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES` | no | `262144` (256 KiB) | Cap on inline-returned attachment bytes. ‡ |
| `MCP_GSUITE_AUDIT_LOG` | no | `writes` | Audit-log scope. § |
| `MCP_GSUITE_AUDIT_LOG_PATH` | no | `~/.local/state/mcp-gsuite/audit.jsonl` | Path to the JSONL audit log. |
| `MCP_GSUITE_AUDIT_LOG_MAX_BYTES` | no | `10485760` (10 MiB) | Size-based rotation threshold in bytes. Set to `0` to disable rotation. |
| `MCP_GSUITE_AUDIT_LOG_KEEP` | no | `5` | Number of rotated audit-log files to retain. |
| `NODE_ENV` | no | — | Affects which `.env*` files hydrate config. ¶ |

† One of: `read` (default — read-only tools only, least privilege), `write` (adds non-destructive mutations like `gsuite_email_draft_create`, `gsuite_email_label_create`, `gsuite_auth_start`), `destructive` (adds delete tools). Levels nest. Each tool's level is derived from its MCP annotations (`readOnlyHint: true` → `read`; `destructiveHint: true` → `destructive`; explicit `readOnlyHint: false` AND `destructiveHint: false` → `write`; missing annotations → `destructive` fail-safe); a tool registers when its derived level ≤ the configured level. Unknown values abort startup.

‡ Larger attachments must be saved via the download tool.

§ One of `off`, `writes` (record only non-read tool calls), `all` (record every invocation).

¶ On load the server reads, from the package root and highest precedence first, `.env.local`, then `.env.${NODE_ENV}` (when `NODE_ENV` is set), then `.env`; a var already in the environment (e.g. your MCP client's `env` block) always wins over a file. The `server:*:dev`/`ki:server:mcp:inspect` scripts set `development`, so `.env.development` is also picked up there.

### Claude Desktop Configuration

Run `bun run build` first so `dist/mcp-server/index.js` exists, then add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mcp-gsuite": {
      "command": "node",
      "args": ["/path/to/mcp-gsuite/dist/mcp-server/index.js"],
      "env": {
        "MCP_GSUITE_CLIENT_ID": "your-client-id",
        "MCP_GSUITE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

A starter is in [`claude-config-sample.json`](./claude-config-sample.json).

### Running From Source (Dev)

```bash
cp .env.example .env.development
# edit .env.development with your Google OAuth credentials, then:
bun run ki:server:mcp:dev    # MCP server
bun run ki:server:auth:dev   # OAuth server on :3334
```

## Authentication

OAuth runs out-of-band via the standalone auth server:

1. Start `bun run ki:server:auth:dev` (listens on `http://localhost:3334`).
2. In your MCP client, call the `gsuite_auth_start` tool — it returns a sign-in URL.
3. Open the URL, sign in with the Google account you want to access, grant the requested scope.
4. Tokens (including refresh token) are persisted to `~/.mcp-gsuite-tokens.json` (override with `MCP_GSUITE_TOKEN_PATH`).
5. The MCP server reads that file and refreshes tokens transparently when they expire.

To force re-authentication (or if the refresh token is revoked), delete the token file and call `gsuite_auth_start` again.

**Scope troubleshooting.** If Gmail API calls return 403 after a successful sign-in, inspect the `scope` field in the token file — Google only grants scopes that are pre-declared on the **OAuth consent screen → Data Access** tab (see [step 3c](#3c-configure-data-access-scopes)). If `gmail.modify` is missing from `scope`, add it to Data Access, delete the token file, and re-authenticate.

## Available Tools

32 tools across six areas, all prefixed `gsuite_email_` (server-level auth/meta tools are `gsuite_auth_*` / `gsuite_about`). Each tool's access level (`read`, `write`, or `destructive`) is derived from its MCP annotations (`readOnlyHint` / `destructiveHint`), not its name, so the access-level gate (`MCP_GSUITE_ACCESS_LEVEL`) decides at boot which to register. Default `MCP_GSUITE_ACCESS_LEVEL=read` exposes only the 12 read tools; `write` adds non-destructive mutations (draft/label-create/relabel/trash/auth); `destructive` enables all 32. Default OAuth scopes: `GSUITE_DEFAULT_SCOPES` in [`src/config/index.ts`](./src/config/index.ts) — the single source of truth for consent and refresh across email, calendar, and drive/sheets.

### auth

| Tool                 | Level   | Purpose                                                          |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `gsuite_about`       | `read`  | Server version, scopes, token store path.                        |
| `gsuite_auth_start`  | `write` | Returns the URL to start Google OAuth consent.[^auth-server]     |
| `gsuite_auth_status` | `read`  | Whether a token is persisted + scope/expiry metadata.[^no-token] |

### label

| Tool                        | Level         | Purpose                                                     |
| --------------------------- | ------------- | ----------------------------------------------------------- |
| `gsuite_email_labels_list`  | `read`        | List all system + user labels with `id` and `name`.         |
| `gsuite_email_label_create` | `write`       | Create a user label.                                        |
| `gsuite_email_label_update` | `write`       | Rename a user label.[^system-labels]                        |
| `gsuite_email_label_delete` | `destructive` | Delete a user label.[^system-labels] [^label-delete-effect] |

### message

| Tool                                 | Level   | Purpose                                                                     |
| ------------------------------------ | ------- | --------------------------------------------------------------------------- |
| `gsuite_email_messages_search`       | `read`  | Gmail-query search at message granularity.[^paginated]                      |
| `gsuite_email_message_get`           | `read`  | Full message: headers, body, labels, attachments.[^html-strip][^msg-format] |
| `gsuite_email_message_raw`           | `read`  | Write the raw RFC 2822 message to `outputPath` (e.g. `.eml`).[^raw-no-body] |
| `gsuite_email_message_label`         | `write` | Add label ids to a message.                                                 |
| `gsuite_email_message_unlabel`       | `write` | Remove label ids from a message.                                            |
| `gsuite_email_message_mark_read`     | `write` | Remove the `UNREAD` label.[^sugar]                                          |
| `gsuite_email_message_mark_unread`   | `write` | Add the `UNREAD` label.[^sugar]                                             |
| `gsuite_email_message_archive`       | `write` | Remove the `INBOX` label.[^sugar]                                           |
| `gsuite_email_message_trash`         | `write` | Move to Trash via `messages.trash`.[^trash]                                 |
| `gsuite_email_messages_batch_modify` | `write` | Add/remove labels on up to 1000 messages in one call.[^batch-modify]        |

### attachment

| Tool                               | Level  | Purpose                                                                     |
| ---------------------------------- | ------ | --------------------------------------------------------------------------- |
| `gsuite_email_attachment_get`      | `read` | Download an attachment, to disk via `outputPath` or inline.[^attach-inline] |
| `gsuite_email_attachment_metadata` | `read` | Get filename, MIME type, size without downloading bytes.[^attach-metadata]  |

### thread

| Tool                              | Level   | Purpose                                                                |
| --------------------------------- | ------- | ---------------------------------------------------------------------- |
| `gsuite_email_threads_search`     | `read`  | Gmail-query search at thread granularity.[^paginated] [^thread-shape]  |
| `gsuite_email_thread_get`         | `read`  | Full thread: every message with headers, body, label ids, attachments. |
| `gsuite_email_thread_label`       | `write` | Add label ids to every message in a thread.                            |
| `gsuite_email_thread_unlabel`     | `write` | Remove label ids from every message in a thread.                       |
| `gsuite_email_thread_mark_read`   | `write` | Remove the `UNREAD` label from every message in the thread.[^sugar]    |
| `gsuite_email_thread_mark_unread` | `write` | Add the `UNREAD` label to every message in the thread.[^sugar]         |
| `gsuite_email_thread_archive`     | `write` | Remove the `INBOX` label from every message in the thread.[^sugar]     |
| `gsuite_email_thread_trash`       | `write` | Move every message in the thread to Trash via `threads.trash`.[^trash] |

### draft

| Tool                        | Level         | Purpose                                                                            |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `gsuite_email_draft_create` | `write`       | Create a Gmail draft (saved, never sent).[^draft-shape]                            |
| `gsuite_email_draft_update` | `write`       | Replace an existing draft's contents (same fields as `gsuite_email_draft_create`). |
| `gsuite_email_drafts_list`  | `read`        | List drafts with headers + snippet; optional `query` filter.[^paginated]           |
| `gsuite_email_draft_get`    | `read`        | Get a draft's full headers, body, label ids, and attachment refs.                  |
| `gsuite_email_draft_delete` | `destructive` | Permanently delete a draft (does not go to Trash).                                 |

This server deliberately exposes draft creation but no sending tool. The user reviews drafts in Gmail and clicks Send — Claude never directly delivers mail. The OAuth scope technically permits sending; the MCP surface does not.

[^auth-server]: The auth server must be running on `:3334`.

[^no-token]: Never returns access or refresh token values.

[^system-labels]: System labels (INBOX, SENT, etc.) cannot be renamed or deleted; Gmail rejects the request.

[^label-delete-effect]: Gmail removes the label from every message that had it; the messages themselves are untouched.

[^paginated]: Returns `{<items>, nextPageToken?}`. Pass `nextPageToken` back as `pageToken` to fetch the next page; it's omitted on the last page.

[^html-strip]: If the message has no `text/plain` part, the HTML body is stripped and returned instead.

[^msg-format]: `format` defaults to `'full'`. Pass `'metadata'` to skip the body (headers + labels only, with `body` and `attachments` empty) — cheaper when the caller doesn't need content.

[^raw-no-body]: Returns `{messageId, path, sizeBytes}`. The body never travels through the response, so this is safe for messages with large attachments. Subject/date aren't returned — with `format=raw` Gmail does not break out headers (use `gsuite_email_message_get`).

[^attach-inline]: With `outputPath`, writes the decoded bytes and returns `{messageId, path, sizeBytes}`. Without it, returns `{filename, mimeType, data}` (base64url) — suitable for small attachments only.

[^attach-metadata]: Backed by `messages.get(format=full)` — fetches the message part tree without downloading the attachment bytes. Returns `{messageId, attachmentId, filename, mimeType, sizeBytes}`.

[^thread-shape]: Each thread carries `id`, `snippet`, `messageCount`, latest-message headers, and the union of label ids across all messages.

[^draft-shape]: Plain-text body via `bodyText`, optional rich body via `bodyHtml` (both → `multipart/alternative` so plain-text clients still render). Attachments accept either a bare path or `{path, filename?, mimeType?}` to override either field. With `replyToMessageId` we wire `In-Reply-To`, extend `References`, prepend `Re:` to Subject, and tie the draft to the right thread. With `replyAll: true` (requires `replyToMessageId`), `to` (= original From + To) and `cc` (= original Cc) auto-populate, with the authenticated account removed; caller-supplied `to` / `cc` win.

[^sugar]: Sugar over `messages.modify` / `threads.modify` so callers don't have to know the magic system-label id.

[^trash]: Recoverable for ~30 days from Gmail's Trash UI. Permanent deletion (`messages.delete` / `threads.delete`) is intentionally not exposed.

[^batch-modify]: Backed by Gmail `messages.batchModify`. At least one of `addLabelIds` or `removeLabelIds` is required. Returns `{count, messageIds, addLabelIds, removeLabelIds}` echoing the operation; Gmail returns 204 No Content on success.

## Security Model

- Secrets (`MCP_GSUITE_CLIENT_SECRET`) come from env vars only; never committed. `.env*` files are gitignored except `.env*.example` templates.
- OAuth tokens live at `MCP_GSUITE_TOKEN_PATH` (default `~/.mcp-gsuite-tokens.json`), mode `0600`.
- Token writes are **atomic** — temp file + `rename()`. A crash mid-write cannot corrupt the token file.
- Token values are **never** logged or returned by any MCP tool. The `gsuite_auth_status` tool exposes presence flags and metadata only.
- The auth server binds to `localhost:3334` only and accepts a single OAuth callback at a time; CSRF state entries expire after 10 minutes.
- If the token file is lost, revoked, or you want to switch Google accounts, delete the file and re-authenticate.

## Troubleshooting

**Port 3334 already in use.** Another auth-server process is bound to the port. Free it:

```bash
bunx kill-port 3334
```

**Gmail API returns 403 after a successful sign-in.** The OAuth consent screen didn't pre-declare the scope, so Google silently dropped it. Inspect `~/.mcp-gsuite-tokens.json` and check the `scope` field; if `gmail.modify` is missing, add it via **OAuth consent screen → Data Access** ([step 3c](#3c-configure-data-access-scopes)), delete the token file, and re-run the `gsuite_auth_start` tool.

**Token revoked or refresh fails.** Delete the token file and re-authenticate:

```bash
rm ~/.mcp-gsuite-tokens.json
# then call the `gsuite_auth_start` tool again
```

**Claude Desktop shows no tools / "Cannot find module".** The built server isn't where the config points. Rebuild and verify:

```bash
bun run build
ls dist/mcp-server/index.js
```

Then restart Claude Desktop. The `args` path in the Claude config must point at the compiled `dist/mcp-server/index.js`, not the TS source.

**`bun run ki:test:smoke` fails with "tool surface mismatch".** You've added or removed a tool but the smoke test's expected list is out of sync. Update both [`scripts/smoke.ts`](./scripts/smoke.ts) (`EXPECTED_TOOLS`) and the matching list in `src/tool-registration.test.ts`.

**Refresh token expires every 7 days.** Your OAuth consent screen is in **Testing** mode. Switch to **Published** under **OAuth consent screen → Audience** ([step 3b](#3b-publish-the-app)) — the app stays unverified for personal use; you'll see a one-time "advanced → continue" warning during sign-in.

## Directory Structure

```text
├── claude-config-sample.json   # Example Claude Desktop config
├── .github/workflows/ci.yml    # Lint, typecheck, test:coverage, smoke
├── package.json
├── tsconfig.json               # Base TS config
├── tsconfig.build.json         # Build config (emits to dist/)
├── .env.example                # Template for GMAIL_* env vars
├── scripts/
│   └── smoke.ts                # Wire-level tool-surface smoke test (bun run ki:test:smoke)
├── src/
│   ├── config/index.ts         # loadConfig(env?) → Config (no env read at import)
│   ├── auth-server/index.ts    # Standalone OAuth server (port 3334)
│   ├── mcp-server/index.ts     # MCP server entry — loadConfig() + registers every tool
│   ├── tools/                  # Thin tool defs grouped by resource; call into main/
│   │   ├── auth/               # about, authenticate, check-auth-status
│   │   ├── labels/             # label_list/create/update/delete
│   │   ├── messages/           # message_* (search, get, label, sugar wrappers, batch_modify)
│   │   ├── attachments/        # attachment_get + attachment_get_metadata
│   │   ├── threads/            # thread_* (search, get, label, sugar wrappers)
│   │   └── drafts/             # draft_create/update/list/get/delete
│   ├── main/                   # Real implementation (config injected as first arg)
│   │   ├── auth/               # OAuth2Client + token refresh + atomic token persistence
│   │   ├── google-client/      # Shared authorized client + service factories (gmail; calendar/drive/sheets seams)
│   │   ├── email/              # Gmail payload parsing (headers, body, attachments)
│   │   ├── auth-info/          # about / authenticate / auth-status handlers
│   │   └── {labels,messages,threads,drafts,attachments}/  # one function per tool
│   └── utils/                  # MIME builder, paths, result envelopes, access-level, audit-log, annotations
└── dist/                       # Build output (gitignored, created by `bun run build`)
    └── mcp-server/index.js     # Compiled entry point used by Claude Desktop
```

## Development

```bash
bun run ki:server:mcp:dev      # bun --watch, MCP server
bun run ki:server:auth:dev     # bun --watch, OAuth server
bun run ki:server:mcp:start    # build then run from dist/ under node
bun run ki:server:auth:start   # build then run auth server from dist/ under node
bun run ki:server:mcp:inspect  # MCP Inspector against TS source
bun run test                # vitest (use `bun run test`, not `bun test`)
bun run test:coverage       # vitest + 100% threshold enforced
bun run ki:test:smoke          # build + boot server over stdio MCP, assert wire-level tool surface
bun run ki:lint:types          # tsc --noEmit
bun run ki:lint:check          # Biome
bun run ki:lint:fix            # Biome auto-fix (--unsafe)
bun run ki:lint:md             # prettier + markdownlint for *.md
```

## Extending the Server

Add a new tool by registering it in the appropriate module under [`src/tools/<resource>/`](./src/tools/) and re-exporting from [`src/tools/index.ts`](./src/tools/index.ts). Follow the existing pattern:

1. Pick a resource module (or create a new one) and name the tool `gsuite_<domain>_<resource>_<action>` (e.g. `gsuite_email_messages_search`) (snake_case; plural resource for collection ops). Set `annotations` to one of the presets in [`src/utils/annotations.ts`](./src/utils/annotations.ts) (`READ_ONLY_REMOTE`, `WRITE_REMOTE`, `WRITE_IDEMPOTENT_REMOTE`, `DESTRUCTIVE_REMOTE`) — the access-level gate in [`src/utils/access-level.ts`](./src/utils/access-level.ts) maps the annotation to `read` / `write` / `destructive` and decides whether to register the tool under the current `MCP_GSUITE_ACCESS_LEVEL` value, and the audit log uses the derived level as the `level` field.
2. Validate inputs with a Zod schema; mark optional fields explicitly.
3. Set MCP annotations honestly via the constants in [`src/utils/annotations.ts`](./src/utils/annotations.ts) (`READ_ONLY_REMOTE`, `WRITE_IDEMPOTENT_REMOTE`, `DESTRUCTIVE_REMOTE`, `WRITE_REMOTE`).
4. Return successes via `jsonResult(...)` and failures via `errorResult('verbing', err)` so the client gets `isError: true` with a recognisable message.
5. Update `EXPECTED_TOOLS` in [`scripts/smoke.ts`](./scripts/smoke.ts) **and** the matching list in [`src/tool-registration.test.ts`](./src/tool-registration.test.ts) so both `bun run ki:test:smoke` and the unit suite stay in sync.
