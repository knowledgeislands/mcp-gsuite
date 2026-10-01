---
id: MCP-GSUITE-TOOL-002
area: TOOL
title: Add incremental Gmail history
theme: tool-surface
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-01T19:30:08Z
---

## Goal

Callers can resume Gmail acquisition from an exact mailbox checkpoint, distinguish each kind of change, and recover explicitly when a checkpoint expires.

## Context

Add `history_list({ startHistoryId, maxResults? })` using Gmail `users.history.list` to show changes without rescanning the inbox.

## Boundary

Expose read-only checkpoint and incremental-history operations. No push notifications, retained cursor storage, background synchronization or new OAuth scopes.

## Current state

No history tool or caller-visible mailbox checkpoint exists. Existing message projections omit history IDs; `users.getProfile` is used privately by draft reply-all address resolution. `gmail.modify` is already in configured scopes.

## Steps

- [ ] Create `src/main/history/index.ts` and a matching tool group. Add `gsuite_email_history_checkpoint` over `users.getProfile`, returning only mailbox `historyId`, and `gsuite_email_history_list` over `users.history.list`.
- [ ] Use decimal-string history IDs throughout, with bounded `maxResults` and `pageToken`. Return provider-shaped history records with explicit added/deleted-message and added/removed-label arrays, top-level `historyId` and optional `nextPageToken`; never coerce IDs to numbers or flatten away event kind.
- [ ] On history-list 404, return an actionable resynchronization error. Document acquiring a checkpoint before a complete search and replaying changes from it, draining all pages before saving the final checkpoint. Keep cursor storage caller-owned.
- [ ] Register both tools as `READ_ONLY_REMOTE`, with matching output schemas, and wire the new group through `src/tools/index.ts`. Add tests for checkpoint, each event type, empty results, large string IDs, pagination, expired cursor and other errors.
- [ ] Update registration and smoke inventories plus README examples for initial sync, resumed sync and expired-checkpoint recovery.

## Files touched

New `src/main/history/index.ts` and tests, new `src/tools/history/index.ts`, `src/tools/index.ts`, `src/tool-registration.test.ts`, `scripts/smoke.ts`, and `README.md`.

## Verify

Run `bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, `bun run ki:test:smoke`, then focused `ki repo audit --skill ki-repo-mcp --repo .` and `ki repo audit --skill ki-work-roadmap --repo .` sequentially. Use isolated fixtures and mocked provider calls; no live account operation is part of verification. Tests must prove page tokens are accepted as well as returned, IDs stay exact strings, and no state is stored by the server.

## Dependencies / blocks

No build-order blocker. Serialize edits to shared tool registration and smoke inventories with sibling mail items; landing order is a coordination preference, not a dependency.

## Documentation impact

### Decision Records

No new architectural choice is required; follow the existing injected configuration and access-gating decisions.

### Specifications

Update tool schemas and regression assertions as the executable contract; this repository has no separate declared specification surface.

### Guides

Document mailbox checkpoint acquisition, pagination and full-search recovery; avoid implying that a checkpoint acquired after scanning cannot miss concurrent changes.

### Roadmap

Keep this item as the execution authority; record delivery and review evidence here without accepting or pruning other work.

## Discussion

### Where the start point comes from

Use the mailbox-level history ID from `users.getProfile`, exposed through a dedicated read-only checkpoint tool. Acquire it before the initial full search, then replay and drain subsequent history pages before storing the resulting checkpoint. A per-message history ID does not supply the same explicit mailbox checkpoint contract.

### Expired history windows

Return an actionable resynchronization error for an expired history ID (provider 404), without inventing a fixed retention duration. Recovery acquires a fresh mailbox checkpoint before a full search and then drains history from that checkpoint; the server never silently resets a caller-owned cursor.

### Projection shape

Preserve the provider-shaped, typed arrays for added messages, deleted messages, and added or removed labels. Keep history IDs as exact decimal strings, and expose both page-token input and continuation output. This avoids losing event identity through flattening.

### Readiness review

The design selects a mailbox-level checkpoint tool and faithful typed history records. The [Gmail history API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) defines pagination and expired-ID errors; [getProfile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile) provides the mailbox history ID. These resolve the earlier checkpoint-source and projection questions.
