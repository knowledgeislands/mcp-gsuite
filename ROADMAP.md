# ROADMAP

Tracked gaps and likely enhancements for `mcp-gsuite`. Items are roughly ranked by likely utility for the current archival / outbound-via-drafts workflow. Status reflects intent, not commitment.

## Currently exposed (32 tools)

- **auth** — `about`, `auth_start`, `auth_status`
- **label** — `labels_list`, `label_create`, `label_update`, `label_delete`
- **message** — `messages_search` (paginated), `message_get`, `message_raw`, `message_label`, `message_unlabel`, `message_mark_read`, `message_mark_unread`, `message_archive`, `message_trash`, `messages_batch_modify`
- **attachment** — `attachment_get`, `attachment_metadata`
- **thread** — `threads_search` (paginated), `thread_get`, `thread_label`, `thread_unlabel`, `thread_mark_read`, `thread_mark_unread`, `thread_archive`, `thread_trash`
- **draft** — `draft_create`, `draft_update`, `drafts_list` (paginated), `draft_get`, `draft_delete`

Names above omit the `gmail_` prefix all tools carry. Resource-scoped tools follow `gmail_<resource>_<action>` (plural resource for collection ops, singular for single-item). Auth tools (`gsuite_about`, `gsuite_auth_start`, `gsuite_auth_status`) are server-level and don't fit that shape.

Drafts are deliberately exposed without a send tool. The user reviews drafts in Gmail and clicks Send; Claude never directly delivers mail.

## Medium-term gaps (half a day each)

- **`message_modify`** — combined add/remove labels in one call on a single message (today's `message_label` / `message_unlabel` are separate trips). Backed by Gmail `messages.modify`. (Note: `message_batch_modify` already shipped — `modify` would just be a single-message convenience and arguably redundant given `message_batch_modify({messageIds: [id], ...})` works fine.)
- **`history_list`** — incremental sync via Gmail `users.history.list`. `history_list({startHistoryId, maxResults?})` returns the changeset. Unlocks "what changed since I last looked" without re-scanning the inbox.
- **Drafts: ASCII-table → markdown-table guard rails** — `bodyHtml` shipped (see above). Outstanding concern: HTML bodies that contain `+---+`-style ASCII tables render terribly in mail clients. Not clear yet whether the right intervention is reject-with-hint, auto-convert, or just doc-it; revisit when actually bitten.

## Bigger scope (deliberate decisions, not drive-bys)

- **`message_send` / `draft_send`** — the OAuth scope (`gmail.modify`) permits this; we deliberately don't expose it. Re-evaluating this is a policy decision, not an implementation question. If we do add it, gate behind an env flag (`GMAIL_ALLOW_SEND=true`) so the default install remains drafts-only.
- **Forward convenience** — `draft_create` already supports reply (`replyToMessageId`) and reply-all (`replyAll: true`, auto-populates `to` and `cc` with self-dedupe). A forward convenience would need to inline the original message + attachments; doable but not yet asked for.
- **MCP resources exposure** — exposing labels/messages as MCP resources (so clients can browse them as a tree) is neat-feeling but unclear payoff over the existing tool surface. Defer until a client actually needs it.
- **Filter management** — `filter_list` / `filter_create` / `filter_delete` over `users.settings.filters`. Useful for automation but adds a new threat surface (a buggy auto-filter can hide mail). Defer until needed.
- **Aliases / Send-As** — `users.settings.sendAs.list`. Only matters if/when we add sending.

## Won't do

- **`watch` / push notifications via Pub/Sub** — `users.watch` + a webhook endpoint requires Cloud Pub/Sub plus a publicly reachable receiver (Cloud Function or similar). That's a fundamentally different deployment shape from a stdio MCP server, and the polling alternative (`history_list` on demand) covers the realistic use cases. Not pursuing.
- **Permanent deletion** — `messages.delete` / `threads.delete` remain deliberately unexposed. `message_trash` / `thread_trash` are recoverable; permanent delete is not, and the OAuth scope is wider than needed for the archival workflow.

## Known limitations

- **Empty `data.drafts` in `draft_list`** — the response shape becomes `{drafts: []}` when Gmail returns no drafts key; documented in the response but worth knowing.
- **No multi-account in a single server process** — `MCP_GSUITE_TOKEN_PATH` switches accounts at startup time, but you can't talk to two accounts simultaneously. Run two server processes if needed.

## Operational

- **End-to-end test against the live API** — currently we mock `googleapis` everywhere. A gated `INTEGRATION=1 bun run test` that hits a real test account would catch breakage when Google evolves the API (or our assumptions about it).
- **Close 100% vitest coverage threshold** — CI currently fails on the threshold check (95.7% lines / 91.9% branches). Major gaps: `src/config/index.ts` env-parse error paths, `audit-log.ts` rotation arms, `paths.ts`. kb-fs and m365 ship the `/* v8 ignore */` pattern for the audit-log TOCTOU defensive arms.
