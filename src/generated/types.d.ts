// Generated on 2026-10-01T05:21:31.129Z by @knowledgeislands/mcp-gsuite@0.9.0
// Server: kit-mcp-gsuite
// Source: /Users/krisbrown/.mcporter/mcporter.json
// Transport: STDIO /Users/krisbrown/.local/share/mise/shims/node /Users/krisbrown/workspaces/kit/knowledgeislands/mcp-gsuite/dist/mcp-server/index.js

import type { CallResult } from 'mcporter';

export interface KitMcpGsuiteTools {
  /**
   * Returns information about this mcp-gsuite server (version, scopes, token store path).
   */
  gsuite_about(params?: Record<string, never>): Promise<CallResult>;

  /**
   * Start the Google OAuth flow. Returns a URL to visit in a browser; on consent the auth server
   * (`mcp-gsuite-auth`, which must be running on the configured port) persists tokens to disk —
   * registered under the `write` role because of that token-store mutation.
   */
  gsuite_auth_start(params?: Record<string, never>): Promise<CallResult>;

  /**
   * Return the current authentication state. Does NOT expose token values — only presence, scope, and
   * expiry.
   */
  gsuite_auth_status(params?: Record<string, never>): Promise<CallResult>;

  /**
   * Create a new user label.
   *
   * @param name Label name (e.g. "Archive/2026")
   */
  gsuite_email_label_create(params: { name: string }): Promise<CallResult>;

  /**
   * Rename a user label. Returns the updated `{labelId, name}`. System labels (INBOX, SENT, etc.) cannot
   * be renamed and the API will reject the request.
   *
   * @param labelId Label id (from `gsuite_email_labels_list`).
   * @param name New label name.
   */
  gsuite_email_label_update(params: { labelId: string; name: string }): Promise<CallResult>;

  /**
   * List all Gmail labels (system + user) with id and name. Returns `{labels: [{id, name}]}`.
   */
  gsuite_email_labels_list(params?: Record<string, never>): Promise<CallResult>;

  /**
   * List existing Gmail filters, including their criteria and actions.
   */
  gsuite_email_filters_list(params?: Record<string, never>): Promise<CallResult>;

  /**
   * Preview or create a future-mail Gmail filter. The same criteria cannot silently acquire conflicting
   * actions. Does not apply to existing mail. No forwarding or automatic deletion.
   */
  gsuite_email_filter_create(params: { criteria: Record<string, unknown>; action: Record<string, unknown>; dry_run?: boolean }): Promise<CallResult>;

  /**
   * Archive a message (remove the `INBOX` system label). The message remains searchable; it just leaves
   * the inbox view.
   */
  gsuite_email_message_archive(params: { messageId: string }): Promise<CallResult>;

  /**
   * Get a message. `format` defaults to `full` (headers + plain-text body + attachment refs); `metadata`
   * returns headers + label ids only, with empty `body` and `attachments` — cheaper when the caller only
   * needs envelope data.
   *
   * @param format? `full` (default): full body + attachment refs. `metadata`: headers + labels only;
   *                `body` and `attachments` are empty.
   */
  gsuite_email_message_get(params: { messageId: string; format?: "metadata" | "full" }): Promise<CallResult>;

  /**
   * Add one or more labels to a message.
   */
  gsuite_email_message_label(params: { messageId: string; labelIds: string[] }): Promise<CallResult>;

  /**
   * Mark a message as read (remove the `UNREAD` system label). Sugar over
   * `gsuite_email_message_unlabel({ labelIds: ["UNREAD"] })` so callers don't need to know the magic id.
   */
  gsuite_email_message_mark_read(params: { messageId: string }): Promise<CallResult>;

  /**
   * Mark a message as unread (add the `UNREAD` system label).
   */
  gsuite_email_message_mark_unread(params: { messageId: string }): Promise<CallResult>;

  /**
   * Fetch the raw RFC 2822 message and write it to `outputPath` (suitable for saving as `.eml`). Returns
   * {messageId, path, sizeBytes} — the message body never travels through the response, so this is safe
   * for messages with large attachments. Subject and date are NOT returned (they live inside the raw
   * bytes; use `gsuite_email_message_get` for headers). `outputPath` is validated against
   * `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) — targets outside that root are rejected.
   *
   * @param outputPath Filesystem path where the decoded RFC 2822 message will be written. Must live
   *                   inside MCP_GSUITE_DOWNLOAD_PATH. Parent directories are created if missing.
   */
  gsuite_email_message_raw(params: { messageId: string; outputPath: string }): Promise<CallResult>;

  /**
   * Move a message to Trash via `messages.trash`. Recoverable for ~30 days from Gmail's Trash UI;
   * distinct from permanent deletion (which this server does not expose).
   */
  gsuite_email_message_trash(params: { messageId: string }): Promise<CallResult>;

  /**
   * Remove one or more labels from a message.
   */
  gsuite_email_message_unlabel(params: { messageId: string; labelIds: string[] }): Promise<CallResult>;

  /**
   * Add and/or remove labels on up to 1000 messages in a single Gmail `messages.batchModify` call. At
   * least one of `addLabelIds` or `removeLabelIds` is required. Returns `{count, messageIds,
   * addLabelIds, removeLabelIds}` echoing the operation (Gmail returns 204 No Content on success).
   *
   * @param messageIds Up to 1000 message ids in a single call (Gmail API limit).
   */
  gsuite_email_messages_batch_modify(params: { messageIds: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<CallResult>;

  /**
   * Search messages with a Gmail query string (same syntax as the Gmail search box). Returns `{messages,
   * nextPageToken?}`; pass `nextPageToken` back as `pageToken` to fetch the next page. The token is
   * omitted when there are no more results. To filter by a label whose name contains spaces, either pass
   * its exact id(s) via `labelIds` (most reliable) or quote the name in the query
   * (`label:"Matters/Criminal - False Allegations"`) — the server rewrites quoted names to the
   * hyphenated form Gmail expects. An unquoted `label:` with spaces silently matches nothing.
   *
   * @param query Gmail query, e.g. `from:foo@bar.com has:attachment newer_than:7d`
   * @param maxResults? Max results per page (default 20).
   * @param pageToken? Continuation token from a previous `gsuite_email_messages_search` call.
   * @param labelIds? Exact label ids (from `gsuite_email_labels_list`) the message must carry. Reliable
   *                  for any label name, including those with spaces or slashes; ANDed with `query`.
   */
  gsuite_email_messages_search(params: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }): Promise<CallResult>;

  /**
   * Download an attachment by id. With `outputPath`, writes the decoded bytes to that file and returns
   * {messageId, path, sizeBytes} (filename/mimeType come from `gsuite_email_message_get` — they are not
   * duplicated here). Without it, returns {filename, mimeType, data} where `data` is base64url as
   * returned by Gmail; capped at `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES` (default 256 KiB decoded) —
   * attachments above the cap return an error directing the caller to use `outputPath`. `outputPath` is
   * validated against `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) — targets outside that root are
   * rejected.
   *
   * @param outputPath? Optional file path to write the decoded bytes to. Must live inside
   *                    MCP_GSUITE_DOWNLOAD_PATH. If provided, the response omits `data` and returns size
   *                    metadata instead — useful for large attachments that would overflow the response.
   */
  gsuite_email_attachment_get(params: { messageId: string; attachmentId: string; outputPath?: string }): Promise<CallResult>;

  /**
   * Get an attachment's filename, MIME type, and size without downloading the bytes. Fetches the parent
   * message's part tree via `messages.get(format=full)` and looks up the part by attachmentId — useful
   * when deciding whether to download a large attachment.
   */
  gsuite_email_attachment_metadata(params: { messageId: string; attachmentId: string }): Promise<CallResult>;

  /**
   * Archive an entire thread (remove the `INBOX` system label from every message). The thread remains
   * searchable.
   */
  gsuite_email_thread_archive(params: { threadId: string }): Promise<CallResult>;

  /**
   * Get every message in a thread, each with headers, plain-text body (HTML stripped), label ids, and
   * attachment refs.
   */
  gsuite_email_thread_get(params: { threadId: string }): Promise<CallResult>;

  /**
   * Add one or more labels to every message in a thread (Gmail propagates the change automatically).
   */
  gsuite_email_thread_label(params: { threadId: string; labelIds: string[] }): Promise<CallResult>;

  /**
   * Mark every message in a thread as read (remove the `UNREAD` system label).
   */
  gsuite_email_thread_mark_read(params: { threadId: string }): Promise<CallResult>;

  /**
   * Mark every message in a thread as unread (add the `UNREAD` system label).
   */
  gsuite_email_thread_mark_unread(params: { threadId: string }): Promise<CallResult>;

  /**
   * Move every message in a thread to Trash via `threads.trash`. Recoverable for ~30 days from Gmail's
   * Trash UI; permanent deletion is intentionally not exposed.
   */
  gsuite_email_thread_trash(params: { threadId: string }): Promise<CallResult>;

  /**
   * Remove one or more labels from every message in a thread.
   */
  gsuite_email_thread_unlabel(params: { threadId: string; labelIds: string[] }): Promise<CallResult>;

  /**
   * Search threads with a Gmail query string (same syntax as `gsuite_email_messages_search`). Returns
   * `{threads, nextPageToken?}` where each thread carries id, snippet, messageCount, latest-message
   * headers, and the union of label ids across all messages. To filter by a label whose name contains
   * spaces, either pass its exact id(s) via `labelIds` (most reliable) or quote the name in the query
   * (`label:"Matters/Criminal - False Allegations"`) — the server rewrites quoted names to the
   * hyphenated form Gmail expects. An unquoted `label:` with spaces silently matches nothing.
   *
   * @param query Gmail query, e.g. `from:foo@bar.com newer_than:30d`
   * @param maxResults? Max results per page (default 20).
   * @param pageToken? Continuation token from a previous `gsuite_email_threads_search` call.
   * @param labelIds? Exact label ids (from `gsuite_email_labels_list`) a message in the thread must
   *                  carry. Reliable for any label name, including those with spaces or slashes; ANDed
   *                  with `query`.
   */
  gsuite_email_threads_search(params: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }): Promise<CallResult>;

  /**
   * List files in a Drive folder (trashed files excluded). Returns `{files: [{id, name, mimeType,
   * modifiedTime}]}`. Filter by a name substring and/or an exact MIME type (e.g.
   * `application/vnd.google-apps.spreadsheet`).
   *
   * @param folderId Drive folder id (`root` for My Drive root).
   * @param nameContains? Case-insensitive substring the file name must contain.
   * @param mimeType? Exact MIME type the file must have.
   * @param pageSize? Max files to return (Drive default 100, max 1000).
   */
  gsuite_drive_files_list(params: { folderId: string; nameContains?: string; mimeType?: string; pageSize?: number }): Promise<CallResult>;

  /**
   * Get a spreadsheet’s title and per-sheet grid dimensions. Returns `{title, sheets: [{sheetId, title,
   * rowCount, columnCount}]}` — use the sheet titles to build A1 ranges for the values tools.
   *
   * @param spreadsheetId Spreadsheet id (from the URL or `gsuite_drive_files_list`).
   */
  gsuite_sheet_get(params: { spreadsheetId: string }): Promise<CallResult>;

  /**
   * Read a range of cell values. Returns `{range, values}` where `values` is a string[][] (empty cells
   * are ``); trailing empty rows/columns are omitted by the API.
   *
   * @param spreadsheetId Spreadsheet id.
   * @param range A1-notation range, e.g. `Sheet1!A1:C10`.
   * @param majorDimension? Whether each inner array is a row (default `ROWS`) or a column.
   */
  gsuite_sheet_values_get(params: { spreadsheetId: string; range: string; majorDimension?: "ROWS" | "COLUMNS" }): Promise<CallResult>;

  /**
   * Write a rectangular block of values to a range (overwrites the cells it covers). `valueInputOption`
   * defaults to `USER_ENTERED` (values are parsed as if typed in the UI — numbers, dates, formulas);
   * pass `RAW` to store strings verbatim. Returns `{updatedRange, updatedCells, updatedRows,
   * updatedColumns}`.
   *
   * @param spreadsheetId Spreadsheet id.
   * @param range A1-notation range, e.g. `Sheet1!A1:C10`.
   * @param values Row-major cell values to write.
   * @param valueInputOption? `USER_ENTERED` (default): parse like UI input. `RAW`: store verbatim.
   */
  gsuite_sheet_values_update(params: { spreadsheetId: string; range: string; values: unknown[]; valueInputOption?: "USER_ENTERED" | "RAW" }): Promise<CallResult>;

  /**
   * List the calendars on the user’s calendar list. Returns `{calendars: [{id, summary, primary?}]}`.
   */
  gsuite_calendar_calendars_list(params?: Record<string, never>): Promise<CallResult>;

  /**
   * Create an event. `start`/`end` are RFC 3339 timestamps (timed events; the calendar’s timezone
   * applies when the offset is omitted). Attendees are invited by email. Returns the created event’s
   * trimmed projection.
   *
   * @param calendarId? Calendar id (from `gsuite_calendar_calendars_list`); defaults to `primary`.
   * @param summary Event title.
   * @param start Start, RFC 3339 (e.g. `2026-07-09T10:00:00+01:00`).
   * @param end End, RFC 3339.
   * @param attendees? Attendee email addresses.
   */
  gsuite_calendar_event_create(params: { calendarId?: string; summary: string; start: string; end: string; description?: string }): Promise<CallResult>;
  // optional (2): location, attendees

  /**
   * Get a single event, including its description and attendee emails.
   *
   * @param calendarId? Calendar id (from `gsuite_calendar_calendars_list`); defaults to `primary`.
   * @param eventId Event id (from `gsuite_calendar_events_list`).
   */
  gsuite_calendar_event_get(params: { calendarId?: string; eventId: string }): Promise<CallResult>;

  /**
   * Update an event with patch semantics — only the fields provided change; passing `attendees` replaces
   * the full attendee list. Returns the updated event’s trimmed projection.
   *
   * @param calendarId? Calendar id (from `gsuite_calendar_calendars_list`); defaults to `primary`.
   * @param eventId Event id (from `gsuite_calendar_events_list`).
   * @param start? New start, RFC 3339.
   * @param end? New end, RFC 3339.
   * @param attendees? Replacement attendee email list (empty array clears attendees).
   */
  gsuite_calendar_event_update(params: { calendarId?: string; eventId: string; summary?: string; start?: string; end?: string }): Promise<CallResult>;
  // optional (3): description, location, attendees

  /**
   * List events on a calendar, ordered by start time (recurring events are expanded into instances).
   * Returns trimmed events `{id → eventId, summary, start, end, location?, status}`; `start`/`end` are
   * RFC 3339 timestamps (or bare dates for all-day events).
   *
   * @param calendarId? Calendar id (from `gsuite_calendar_calendars_list`); defaults to `primary`.
   * @param timeMin? Lower bound (exclusive) on end time, RFC 3339 (e.g. `2026-07-08T00:00:00Z`).
   * @param timeMax? Upper bound (exclusive) on start time, RFC 3339.
   * @param query? Free-text search over event fields.
   * @param maxResults? Max events to return (Calendar default 250, max 2500).
   */
  gsuite_calendar_events_list(params?: { calendarId?: string; timeMin?: string; timeMax?: string; query?: string; maxResults?: number }): Promise<CallResult>;

  /**
   * Create a draft email in the user's Drafts folder. Does NOT send — the user reviews and sends from
   * Gmail. With `replyToMessageId`, the draft inherits the original's threadId, In-Reply-To and
   * References headers, and a "Re:" subject (unless overridden). With `replyAll: true` (requires
   * `replyToMessageId`), `to` and `cc` auto-populate from the original (deduped against the
   * authenticated account); the caller can still override either by supplying them. At least one of
   * `bodyText` / `bodyHtml` is required; supplying both emits `multipart/alternative` so plain-text
   * fallback survives. Attachments are file paths on the MCP server host; mimeType is inferred from the
   * extension.
   *
   * @param to? Required unless `replyAll` is true. Each entry can be "addr@host" or "Name <addr@host>".
   * @param subject? If omitted and `replyToMessageId` is set, defaults to "Re: <original subject>".
   * @param bodyText? Plain-text body. Line endings are normalised to CRLF. Optional if `bodyHtml` is
   *                  provided.
   * @param bodyHtml? HTML body. When provided alongside `bodyText`, the message is emitted as
   *                  `multipart/alternative` (text/plain + text/html) so plain-text clients still
   *                  render.
   * @param attachments? Each entry is either a filesystem path (filename = basename, mimeType inferred
   *                     from extension) or `{path, filename?, mimeType?}` to override either field.
   * @param replyToMessageId? Gmail messageId of a message to reply to. Threads the draft and copies
   *                          headers.
   * @param replyAll? Requires `replyToMessageId`. Auto-populates `to` (= original From + To) and `cc` (=
   *                  original Cc), excluding the authenticated account. Caller-supplied `to` / `cc` win.
   */
  gsuite_email_draft_create(params?: { to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; bodyText?: string }): Promise<CallResult>;
  // optional (4): bodyHtml, attachments, replyToMessageId, replyAll

  /**
   * Get a draft's full body, headers, label ids, and attachment refs.
   */
  gsuite_email_draft_get(params: { draftId: string }): Promise<CallResult>;

  /**
   * Replace an existing draft entirely. Same shape as `gsuite_email_draft_create` plus `draftId`.
   */
  gsuite_email_draft_update(params: { draftId: string; to?: string[]; cc?: string[]; bcc?: string[]; subject?: string }): Promise<CallResult>;
  // optional (5): bodyText, bodyHtml, attachments, replyToMessageId, replyAll

  /**
   * List drafts (optionally filtered by a Gmail query). Returns `{drafts, nextPageToken?}`.
   *
   * @param query? Optional Gmail-query filter, e.g. `to:foo@bar.com`.
   */
  gsuite_email_drafts_list(params?: { query?: string; maxResults?: number; pageToken?: string }): Promise<CallResult>;
}

