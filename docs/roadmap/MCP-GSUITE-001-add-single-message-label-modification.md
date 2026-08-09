---
id: MCP-GSUITE-001
title: Add single-message label modification
theme: tool-surface
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Achieve the stated outcome: Add single-message label modification.

## Context

Add `message_modify` as a convenience for combined add/remove labels on one message; retain batch modification as the more general operation.

## Boundary

Keep the work limited to the stated surface.

## Current state

`src/main/messages/index.ts` exposes `labelMessage` and `unlabelMessage`. Each issues one `gmail.users.messages.modify` call setting only one side of the request body — `addLabelIds` or `removeLabelIds` — and returns `{messageId, labelIds}` from the API response.

The same module already has a private `modifyMessage` helper taking `{addLabelIds?, removeLabelIds?}`, but it is used only by the three sugar handlers `messageMarkRead`, `messageMarkUnread`, and `messageArchive`, and is neither exported nor registered as a tool.

`messageBatchModify` is the only handler that sets both sides in one request. It takes an array of ids, rejects a call with neither list populated, and echoes the request back because Gmail returns 204 No Content — so it cannot report the message's resulting label set.

A caller swapping labels on a single message therefore either makes two round trips through `gsuite_email_message_label` and `gsuite_email_message_unlabel`, or calls `gsuite_email_messages_batch_modify` with a one-element array and loses the resulting label state from the response.

## Steps

- [ ] Export a combined handler from `src/main/messages/index.ts` taking `{messageId, addLabelIds?, removeLabelIds?}`, reusing the existing private `modifyMessage` helper, rejecting a call with neither list populated the way `messageBatchModify` does, and returning the existing `{messageId, labelIds}` shape via `jsonResult` / `errorResult`.
- [ ] Register the tool in `src/tools/messages/index.ts` with the `WRITE_IDEMPOTENT_REMOTE` annotation preset and the existing `messageLabelStateOutput` output schema, alongside the `_label` / `_unlabel` registrations.
- [ ] Extend `src/main/messages/index.test.ts` with cases for both lists supplied, add-only, remove-only, neither supplied, and the API-error path, so the repository's 100% coverage thresholds still hold.
- [ ] Add the new tool name to the expectations in `src/tool-registration.test.ts` and to `EXPECTED_TOOLS` in `scripts/smoke.ts`, which are the two places the tool surface is asserted.
- [ ] Add a row to the Available Tools table in `README.md`, noting that batch modification remains the general operation for multiple messages.

## Files touched

- `src/main/messages/index.ts` and `src/main/messages/index.test.ts`
- `src/tools/messages/index.ts` (registration and output schema wiring)
- `src/tool-registration.test.ts` and `scripts/smoke.ts` (tool-surface assertions)
- `README.md` Available Tools table

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `bun run ki:test:smoke`
4. `ki repo audit --repo .`
5. The registration test and the smoke test both list the new tool name, and the smoke test's "no `send_*` tools" invariant still passes.

## Dependencies / blocks

This item declares no blocking relationships, and nothing in the current tool surface has to change before it starts.

It does share `src/main/messages/index.ts`, `src/tool-registration.test.ts`, and `scripts/smoke.ts` with [MCP-GSUITE-007](MCP-GSUITE-007-add-incremental-gmail-history.md), which is also at the `next` horizon. Whichever lands second updates the two tool-surface lists on top of the first rather than in parallel with it.

## Discussion

### Registered tool name

`message_modify` in Context is shorthand. The registered name has to follow the server's `<app>_<resource>_<action>` scheme, which puts it at `gsuite_email_message_modify`, next to `gsuite_email_message_label` and `gsuite_email_message_unlabel`.

### Whether the surface should grow at all

The functional gap is small: `gsuite_email_messages_batch_modify` already performs a combined add/remove and accepts a single-element array. The argument for a distinct tool is that it returns the message's resulting label set, which the batch tool cannot, and that it matches the single-message shape of every neighbouring tool. The argument against is one more name on a surface the smoke test already has to enumerate. This should be settled before the item moves to `ready`.

### Whether `_label` and `_unlabel` should be retired or rewired

Once a combined handler exists, `labelMessage` and `unlabelMessage` become special cases of it. Folding them into thin wrappers keeps one API call site; leaving them alone keeps the diff smaller and avoids touching tools that callers already use. No decision has been taken.
