---
id: MCP-GSUITE-TOOL-002
title: Add incremental Gmail history
theme: tool-surface
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Achieve the stated outcome: Add incremental Gmail history.

## Context

Add `history_list({ startHistoryId, maxResults? })` using Gmail `users.history.list` to show changes without rescanning the inbox.

## Boundary

Keep the work limited to the stated surface.

## Current state

The server has no Gmail history support at all: there is no `users.history.list` call, no `main/` module for it, and no registered tool.

Nothing in the current surface hands a caller a `historyId` to start from. `getMessageOutput` in `src/tools/messages/index.ts` projects id, thread, headers, body, labels, and attachments, with no history field; the search projection is likewise history-free. The only `users.getProfile` call in the codebase is in the drafts module, used to resolve the authenticated address for reply-all deduplication, and it does not surface the mailbox-level `historyId` that response also carries. So the tool as described in Context cannot be driven end-to-end by this server today.

`GSUITE_DEFAULT_SCOPES` in `src/config/index.ts` already requests `gmail.modify`, which covers Gmail reads, so no new consent scope is expected — worth confirming against the API reference before implementation rather than assuming.

## Steps

- [ ] Add a `historyList` handler calling `gmail.users.history.list` — either a new `src/main/history/` module or an addition to `src/main/messages/index.ts` — projecting the response to a stable shape and passing `nextPageToken` through the way `searchMessages` does.
- [ ] Decide and implement how a caller obtains a `startHistoryId`: add a history field to an existing read projection, or add a mailbox-level read that returns the current `historyId`.
- [ ] Map an expired or unknown `startHistoryId` to an actionable error directing the caller to fall back to `gsuite_email_messages_search`, rather than surfacing the raw API failure.
- [ ] Register the tool in `src/tools/messages/index.ts` (or a new group file wired from `src/tools/index.ts`) with the `READ_ONLY_REMOTE` annotation preset and an output schema mirroring the projection.
- [ ] Add unit tests following the `vi.mock('../google-client/index.js')` pattern in `src/main/messages/index.test.ts`, covering a populated history, an empty history, pagination, and the expired-start-point error, so the 100% coverage thresholds still hold.
- [ ] Add the tool name to `src/tool-registration.test.ts` and `EXPECTED_TOOLS` in `scripts/smoke.ts`, and add a row to the Available Tools table in `README.md`.

## Files touched

- `src/main/history/index.ts` and its test, or the equivalent additions to `src/main/messages/index.ts` and `src/main/messages/index.test.ts`
- `src/tools/messages/index.ts`, plus `src/tools/index.ts` if a new tool group is introduced
- `src/tool-registration.test.ts` and `scripts/smoke.ts` (tool-surface assertions)
- `README.md` Available Tools table

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `bun run ki:test:smoke`
4. `ki repo audit --repo .`
5. Tests prove the tool is registered `READ_ONLY_REMOTE`, that `nextPageToken` is passed through only when Gmail returns one, and that an expired `startHistoryId` produces the fallback guidance rather than a raw API error.

## Dependencies / blocks

This item declares no blocking relationships. The scope grant it needs is already in place, so nothing external gates the work.

Step 2 is an internal dependency the item carries on itself: the tool is not usable until some part of the surface emits a `historyId`, so that decision has to be made inside this item rather than deferred.

It shares `src/tool-registration.test.ts` and `scripts/smoke.ts` with [MCP-GSUITE-TOOL-001](MCP-GSUITE-TOOL-001-add-single-message-label-modification.md), also at the `next` horizon; whichever lands second updates the tool-surface lists on top of the first.

## Discussion

### Where the start point comes from

This is the open question that decides the item's real shape. Adding `historyId` to the `gsuite_email_message_get` projection is the smaller change but ties the start point to whichever message the caller last read. A mailbox-level read returning the current `historyId` is the more natural pairing for "what changed since I last looked", at the cost of another tool on the surface. Neither has been chosen.

### Expired history windows

Gmail does not retain history indefinitely and rejects a `startHistoryId` that has aged out. The exact retention behaviour should be read from the API reference rather than assumed, but the tool needs a defined answer either way, because the caller's only recovery is a full search — and the point of the tool is to avoid that.

### Projection shape

History records are a union of added messages, deleted messages, and added or removed labels. Flattening them into one change list is friendlier for an agent consuming the result; passing the record structure through is more faithful and less likely to need reshaping later. Undecided.
