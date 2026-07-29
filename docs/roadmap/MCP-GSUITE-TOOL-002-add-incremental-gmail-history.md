---
id: MCP-GSUITE-TOOL-002
title: Add incremental Gmail history
theme: tool-surface
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Add `history_list({ startHistoryId, maxResults? })` using Gmail `users.history.list` to show changes without rescanning the inbox.

## Boundary

Keep the work limited to the stated surface.
