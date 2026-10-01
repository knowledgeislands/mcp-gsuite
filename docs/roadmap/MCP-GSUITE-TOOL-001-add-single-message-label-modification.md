---
id: MCP-GSUITE-TOOL-001
area: TOOL
title: Add single-message label modification
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

Callers can add and remove labels on one Gmail message in a single operation and receive its resulting label state.

## Context

Add `message_modify` as a convenience for combined add/remove labels on one message; retain batch modification as the more general operation.

## Boundary

Add one combined single-message label operation and its tests/documentation. Preserve existing tools and Gmail consent scopes; no mail sending or unrelated refactor.

## Current state

`src/main/messages/index.ts` already has a private combined `modifyMessage` helper; the registered label and unlabel handlers each change only one list. Batch modification accepts both lists but cannot return the resulting labels. Neither `src/tools/messages/index.ts` nor the registration/smoke inventories contains a single-message combined tool.

## Steps

- [ ] Export a single-message combined handler using the existing helper. Require `messageId` and at least one non-empty `addLabelIds` or `removeLabelIds` array; reject a label appearing in both arrays before making any provider call.
- [ ] Register `gsuite_email_message_modify` with strict bounded schemas, `WRITE_IDEMPOTENT_REMOTE`, and the existing label-state output schema. Keep label, unlabel, and batch tools compatible; do not remove or refactor their public APIs.
- [ ] Cover add-only, remove-only, combined, empty, overlapping-list and provider-error cases, including resulting labels and unchanged old-tool behavior.
- [ ] Update `src/tool-registration.test.ts`, `scripts/smoke.ts` and the README catalogue for the new tool; retain the no-send invariant.

## Files touched

`src/main/messages/index.ts`, its tests, `src/tools/messages/index.ts`, `src/tool-registration.test.ts`, `scripts/smoke.ts`, and `README.md`.

## Verify

Run `bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, `bun run ki:test:smoke`, then focused `ki repo audit --skill ki-repo-mcp --repo .` and `ki repo audit --skill ki-work-roadmap --repo .` sequentially. Use isolated fixtures and mocked provider calls; no live account operation is part of verification.

## Dependencies / blocks

No build-order blocker. Serialize edits to shared tool registration and smoke inventories with sibling mail items; landing order is a coordination preference, not a dependency.

## Documentation impact

### Decision Records

No new architectural choice is required; follow the existing injected configuration and access-gating decisions.

### Specifications

Update tool schemas and regression assertions as the executable contract; this repository has no separate declared specification surface.

### Guides

Document the one-call label swap and resulting-label response in README.

### Roadmap

Keep this item as the execution authority; record delivery and review evidence here without accepting or pruning other work.

## Discussion

### Registered tool name

`message_modify` in Context is shorthand. The registered name has to follow the server's `<app>_<resource>_<action>` scheme, which puts it at `gsuite_email_message_modify`, next to `gsuite_email_message_label` and `gsuite_email_message_unlabel`.

### Why add a single-message tool

The new single-message tool returns the resulting label set, which the existing batch tool cannot. That response and the consistent single-message input justify the additional registered name; the plan therefore adds the tool and its smoke-inventory entry.

### Existing label tools

Retain the existing label and unlabel tools and their handlers. Refactoring them into wrappers is unnecessary to deliver the combined operation and would broaden the compatibility surface of this change.

### Readiness review

The planning decision is additive: the new tool earns its surface by returning the resulting labels. Existing label/unlabel tools remain public and are not refactored in this item. This resolves the earlier surface-growth and retirement questions.
