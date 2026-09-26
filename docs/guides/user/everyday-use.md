# Everyday use

Use this guide once the server is connected and authenticated. It covers the work the tool surface is actually shaped for, and the handful of behaviours that surprise people. You do not call these tools directly — you ask your MCP client for an outcome and it chooses them — so what follows is written as the ask, then what happens underneath.

The running server's `tools/list` response is authoritative for the complete tool surface. `README.md` carries the readable inventory with each tool's access level and semantics.

## Triage by sender

> "Find all unread emails from `notifications@github.com` from the last 30 days and archive them."

The client searches with `gsuite_email_messages_search` using the Gmail query `from:notifications@github.com is:unread newer_than:30d` to collect message ids, then passes the whole batch to `gsuite_email_messages_batch_modify` to drop the `INBOX` label — one round trip for up to 1000 messages rather than one call each.

Search results are paginated: a response carries `nextPageToken` when more remain, and the client passes it back as `pageToken`. If a sweep looks suspiciously small, it may simply be the first page.

## Draft a contextual reply

> "Find the meeting invite from Alice yesterday and draft a reply confirming I'll be there at 2pm."

The client locates the thread with `gsuite_email_messages_search`, reads the headers with `gsuite_email_message_get`, then calls `gsuite_email_draft_create` with `replyToMessageId` set. The draft inherits `In-Reply-To`, the References chain, the thread id, and a `Re:` subject, so it lands in the right conversation rather than starting a new one.

Ask for a reply-all and `to` becomes the original From plus To, and `cc` the original Cc, with your own address removed from both so you do not email yourself. Anything you specify explicitly wins over the automatic population.

**The draft is not sent.** This server has no send tool at any access level. The draft appears in Gmail, you read it, and you press Send. That is the deliberate boundary, not a missing feature.

## Find what needs attention

> "Show me unread threads with attachments from this week."

`gsuite_email_threads_search` with `is:unread has:attachment newer_than:7d` returns structured rows per thread — subject, from, snippet, label ids, message count, attachment counts — rather than free-form prose. Thread granularity is usually what you want for triage; message granularity is what you want when acting on one specific email.

## Bulk relabel

> "Move every message labelled `newsletter` from before 2026 to my `reading-list/archive` label and drop `newsletter`."

The client resolves both label ids with `gsuite_email_labels_list`, searches with `label:newsletter before:2026/01/01`, and applies the add and the remove in a single `gsuite_email_messages_batch_modify` call.

**A label name containing spaces needs care.** Gmail's `q` operator only matches the hyphenated form, so `label:Matters/Criminal - False Allegations` unquoted matches nothing at all — silently, with no error. Two things work:

- Pass the exact label id via the `labelIds` parameter on `gsuite_email_messages_search` or `gsuite_email_threads_search`. This is the reliable route.
- Quote the name in the query: `label:"Matters/Criminal - False Allegations"`. The server rewrites a quoted name into the form Gmail expects.

If a filter returns zero results and you are sure it should not, suspect the label name before suspecting the mailbox.

## Handle attachments

Ask for an attachment and the client picks between two tools. `gsuite_email_attachment_metadata` returns the filename, MIME type and size without downloading any bytes — the right first move for anything that might be large. `gsuite_email_attachment_get` downloads it, writing to disk when given an `outputPath` and returning the bytes inline otherwise.

Inline responses are capped at 256 KiB by default, because the encoded form travels through the MCP response envelope. Above that, the download has to go to disk. Written files are confined beneath `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`); a path that escapes that root, lexically or through a symlink, is rejected.

For a whole message as a file, `gsuite_email_message_raw` writes RFC 2822 source to an `.eml` path without the body ever passing through the response.

## Delete, and what deletion means

Trashing is recoverable: `gsuite_email_message_trash` and `gsuite_email_thread_trash` use Gmail's trash operation, and the messages sit in Trash for around thirty days. Permanent deletion of messages and threads is not exposed by this server at any access level.

Three tools genuinely destroy something and are registered only at `MCP_GSUITE_ACCESS_LEVEL=destructive`: deleting a user label, deleting a draft, and deleting a calendar event. Deleting a label removes it from every message that carried it; the messages themselves are untouched.

Calendar deletion asks twice by design — `gsuite_calendar_event_delete` defaults to `dry_run: true` and returns the event it would delete. Only an explicit `dry_run: false` removes it.

## Beyond email

> "What's on my calendar next Tuesday?"

`gsuite_calendar_events_list` returns events ordered by start time, with recurring events expanded into instances. Creating and updating events takes RFC 3339 timestamps; a timestamp without an offset is interpreted in the calendar's own timezone, which is usually what you meant but worth knowing when the answer looks an hour out.

> "Read the totals from my budget spreadsheet."

`gsuite_drive_files_list` finds the file — filter by name substring or by the spreadsheet MIME type — then `gsuite_sheet_get` returns the sheet titles and grid dimensions you need to build an A1 range, and `gsuite_sheet_values_get` reads it. Writing back with `gsuite_sheet_values_update` defaults to `USER_ENTERED`, so values are parsed the way typing them into the UI would parse them.

Drive access is read-only by scope: the default scope set requests `drive.readonly`, so no amount of access level will let the server modify a Drive file.

## Recovery

If a call fails rather than returning an empty result, [Troubleshooting](troubleshooting.md) covers the common causes. An empty result is usually a query problem — reach for the label caveat above first.
