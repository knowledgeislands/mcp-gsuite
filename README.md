# mcp-gsuite

[![CI](https://github.com/knowledgeislands/mcp-gsuite/actions/workflows/ci.yml/badge.svg)](https://github.com/knowledgeislands/mcp-gsuite/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@knowledgeislands/mcp-gsuite.svg)](https://www.npmjs.com/package/@knowledgeislands/mcp-gsuite) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

An MCP (Model Context Protocol) server that connects Claude with Google Workspace. Gmail is the deepest surface — search, read, label, draft — alongside Calendar events, Drive file listing, and Sheets read and write, all on one shared client, scope set, and access gate.

## Features

- **Search and triage** — Gmail-query syntax at message + thread granularity, batch-relabel up to 1000 messages in a single API call.
- **Label management** — list/create/rename/delete user labels; toggle read/unread/archive/trash via sugar tools so callers don't have to know system-label ids.
- **Recoverable trash** — `messages.trash` / `threads.trash` only. Permanent deletion (`messages.delete` / `threads.delete`) is deliberately not exposed.
- **Drafts-only outbound** — compose plain text + HTML (with `multipart/alternative` fallback), attachments with filename/MIME-type overrides, reply + reply-all (self-dedupe via cached profile). **Never sends mail** — the user reviews drafts in Gmail and clicks Send.
- **Calendar, Drive and Sheets** — list and edit calendar events, find Drive files, and read or update spreadsheet ranges through the same authenticated client.
- **Least privilege by default** — the access-level gate registers only read-only tools unless you raise it, so a mutating tool the model cannot see is a mutating tool it cannot call.
- **Strict input schemas** — every tool registers a Zod schema; `tools/list` reports proper JSON Schema and honest MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

**Quality:** the full test suite enforces 100% coverage; CI also boots the built server over stdio MCP and asserts the wire-level tool surface on every commit (`bun run ki:test:smoke`).

## Documentation

Practical instructions live in [`docs/guides/`](./docs/guides/README.md), grouped by who needs them.

**To run this server against your own Google account**, follow the [user guides](./docs/guides/user/README.md) in order:

1. [Set up Google Cloud credentials](./docs/guides/user/google-cloud-setup.md) — the console procedure that produces an OAuth client, and the scope declaration that everything else depends on.
2. [Install and connect the server](./docs/guides/user/installation.md) — build `dist/` and register it with Claude Desktop or another MCP client.
3. [Configure the server](./docs/guides/user/configuration.md) — every environment variable, and the access level that decides what your client can see.
4. [Authenticate with Google](./docs/guides/user/authentication.md) — the out-of-band OAuth flow and where the tokens live.
5. [Everyday use](./docs/guides/user/everyday-use.md) — the workflows this tool surface is shaped for, and the caveats that catch people out.
6. [Troubleshooting](./docs/guides/user/troubleshooting.md) — the failures a first-time reader actually hits, and how to recover from each.

**To change this server**, read the [developer guides](./docs/guides/developer/README.md): [local development](./docs/guides/developer/local-development.md) for the two processes and the verification gates, and [add a tool](./docs/guides/developer/adding-a-tool.md) for extending the surface.

[`CONTRIBUTING.md`](./CONTRIBUTING.md) covers the contribution mechanics, [`docs/decisions/`](./docs/decisions/README.md) records why the server is the way it is, and [`docs/roadmap/`](./docs/roadmap) records what is planned rather than delivered.

## Available Tools

42 tools across email, calendar, Drive and Sheets, plus the server's own `gsuite_about` and `gsuite_auth_*` meta tools. Each tool's access level (`read`, `write`, or `destructive`) is derived from its MCP annotations (`readOnlyHint` / `destructiveHint`), not its name, so the access-level gate (`MCP_GSUITE_ACCESS_LEVEL`) decides at boot which to register: the default `read` exposes the 18 read-only tools, `write` adds 21 non-destructive mutations, and `destructive` adds the final 3. Default OAuth scopes: `GSUITE_DEFAULT_SCOPES` in [`src/config/index.ts`](./src/config/index.ts) — the single source of truth for consent and refresh across email, calendar, and Drive/Sheets.

The running server's `tools/list` response is the authority on what exists; the tables below are a readable copy of it, and `bun run ki:test:smoke` is what keeps the two honest.

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

| Tool | Level | Purpose |
| --- | --- | --- |
| `gsuite_email_messages_search` | `read` | Gmail-query search at message granularity.[^paginated] |
| `gsuite_email_message_get` | `read` | Full message: headers, body, labels, attachments.[^html-strip][^msg-format] |
| `gsuite_email_message_raw` | `read` | Write the raw RFC 2822 message to `outputPath` (e.g. `.eml`).[^raw-no-body] |
| `gsuite_email_message_label` | `write` | Add label ids to a message. |
| `gsuite_email_message_unlabel` | `write` | Remove label ids from a message. |
| `gsuite_email_message_mark_read` | `write` | Remove the `UNREAD` label.[^sugar] |
| `gsuite_email_message_mark_unread` | `write` | Add the `UNREAD` label.[^sugar] |
| `gsuite_email_message_archive` | `write` | Remove the `INBOX` label.[^sugar] |
| `gsuite_email_message_trash` | `write` | Move to Trash via `messages.trash`.[^trash] |
| `gsuite_email_messages_batch_modify` | `write` | Add/remove labels on up to 1000 messages in one call.[^batch-modify] |

### attachment

| Tool | Level | Purpose |
| --- | --- | --- |
| `gsuite_email_attachment_get` | `read` | Download an attachment, to disk via `outputPath` or inline.[^attach-inline] |
| `gsuite_email_attachment_metadata` | `read` | Get filename, MIME type, size without downloading bytes.[^attach-metadata] |

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

| Tool | Level | Purpose |
| --- | --- | --- |
| `gsuite_email_draft_create` | `write` | Create a Gmail draft (saved, never sent).[^draft-shape] |
| `gsuite_email_draft_update` | `write` | Replace an existing draft's contents (same fields as `gsuite_email_draft_create`). |
| `gsuite_email_drafts_list` | `read` | List drafts with headers + snippet; optional `query` filter.[^paginated] |
| `gsuite_email_draft_get` | `read` | Get a draft's full headers, body, label ids, and attachment refs. |
| `gsuite_email_draft_delete` | `destructive` | Permanently delete a draft (does not go to Trash). |

This server deliberately exposes draft creation but no sending tool. The user reviews drafts in Gmail and clicks Send — Claude never directly delivers mail. The OAuth scope technically permits sending; the MCP surface does not.

### calendar

| Tool | Level | Purpose |
| --- | --- | --- |
| `gsuite_calendar_calendars_list` | `read` | List the calendars on the user's calendar list. |
| `gsuite_calendar_events_list` | `read` | Events on a calendar, ordered by start time.[^cal-expand] |
| `gsuite_calendar_event_get` | `read` | One event's trimmed projection: summary, start, end, location, status. |
| `gsuite_calendar_event_create` | `write` | Create a timed event from RFC 3339 start/end; attendees invited by email.[^cal-tz] |
| `gsuite_calendar_event_update` | `write` | Update an existing event's summary, times, description, or location. |
| `gsuite_calendar_event_delete` | `destructive` | Delete an event.[^cal-dry-run] |

### drive and sheets

| Tool | Level | Purpose |
| --- | --- | --- |
| `gsuite_drive_files_list` | `read` | List files in a Drive folder, filtered by name substring and/or MIME type.[^drive-trash] |
| `gsuite_sheet_get` | `read` | A spreadsheet's title and per-sheet grid dimensions, for building A1 ranges. |
| `gsuite_sheet_values_get` | `read` | Read an A1-notation range (e.g. `Sheet1!A1:C10`). |
| `gsuite_sheet_values_update` | `write` | Write a row-major range back.[^sheet-input] |

Drive access is read-only by scope: the default set requests `drive.readonly`, so no access level permits modifying a Drive file.

[^auth-server]: The auth server must be running on `:3334`.

[^no-token]: Never returns access or refresh token values.

[^system-labels]: System labels (INBOX, SENT, etc.) cannot be renamed or deleted; Gmail rejects the request.

[^label-delete-effect]: Gmail removes the label from every message that had it; the messages themselves are untouched.

[^paginated]: Returns `{<items>, nextPageToken?}`. Pass `nextPageToken` back as `pageToken` to fetch the next page; it's omitted on the last page.

[^html-strip]: If the message has no `text/plain` part, the HTML body is stripped and returned instead.

[^msg-format]: `format` defaults to `'full'`. Pass `'metadata'` to skip the body (headers + labels only, with `body` and `attachments` empty) — cheaper when the caller doesn't need content.

[^raw-no-body]: Returns `{messageId, path, sizeBytes}`. The body never travels through the response, so this is safe for messages with large attachments. Subject/date aren't returned — with `format=raw` Gmail does not break out headers (use `gsuite_email_message_get`).

[^sugar]: Sugar over `messages.modify` / `threads.modify` so callers don't have to know the magic system-label id.

[^trash]: Recoverable for ~30 days from Gmail's Trash UI. Permanent deletion (`messages.delete` / `threads.delete`) is intentionally not exposed.

[^batch-modify]: Backed by Gmail `messages.batchModify`. At least one of `addLabelIds` or `removeLabelIds` is required. Returns `{count, messageIds, addLabelIds, removeLabelIds}` echoing the operation; Gmail returns 204 No Content on success.

[^attach-inline]: With `outputPath`, writes the decoded bytes and returns `{messageId, path, sizeBytes}`. Without it, returns `{filename, mimeType, data}` (base64url) — suitable for small attachments only.

[^attach-metadata]: Backed by `messages.get(format=full)` — fetches the message part tree without downloading the attachment bytes. Returns `{messageId, attachmentId, filename, mimeType, sizeBytes}`.

[^thread-shape]: Each thread carries `id`, `snippet`, `messageCount`, latest-message headers, and the union of label ids across all messages.

[^draft-shape]: Plain-text body via `bodyText`, optional rich body via `bodyHtml` (both → `multipart/alternative` so plain-text clients still render). Attachments accept either a bare path or `{path, filename?, mimeType?}` to override either field. With `replyToMessageId` we wire `In-Reply-To`, extend `References`, prepend `Re:` to Subject, and tie the draft to the right thread. With `replyAll: true` (requires `replyToMessageId`), `to` (= original From + To) and `cc` (= original Cc) auto-populate, with the authenticated account removed; caller-supplied `to` / `cc` win.

[^cal-expand]: Recurring events are expanded into instances. `start` / `end` are RFC 3339 timestamps, or bare dates for all-day events.

[^cal-tz]: A timestamp without an offset is interpreted in the calendar's own timezone.

[^cal-dry-run]: `dry_run` defaults to `true` and returns the event that would be deleted; only an explicit `dry_run: false` removes it.

[^drive-trash]: Trashed files are excluded. Returns `{files: [{id, name, mimeType, modifiedTime}]}`.

[^sheet-input]: `valueInputOption` defaults to `USER_ENTERED`, which parses values as the Sheets UI would; pass `RAW` to store them verbatim.

## Security Model

- Secrets (`MCP_GSUITE_CLIENT_SECRET`) come from env vars only; never committed. `.env*` files are gitignored except `.env*.example` templates.
- OAuth tokens live at `MCP_GSUITE_TOKEN_PATH` (default `~/.local/state/ki/mcp-gsuite/oauth-tokens.json`), mode `0600`.
- Token writes are **atomic** — temp file + `rename()`. A crash mid-write cannot corrupt the token file.
- Token values are **never** logged or returned by any MCP tool. The `gsuite_auth_status` tool exposes presence flags and metadata only.
- The auth server binds to `localhost:3334` only and accepts a single OAuth callback at a time; CSRF state entries expire after 10 minutes.
- Tool registration is gated by access level, so the default configuration cannot mutate anything at all.
- If the token file is lost, revoked, or you want to switch Google accounts, delete the file and re-authenticate — see [Authenticate with Google](./docs/guides/user/authentication.md).
