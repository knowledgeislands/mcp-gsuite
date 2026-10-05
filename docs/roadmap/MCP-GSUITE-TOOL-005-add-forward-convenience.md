---
id: MCP-GSUITE-TOOL-005
area: TOOL
title: Add forward convenience
theme: tool-surface
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 01dc0e74102c174133e0ac9dc408822e337a960a
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T07:40:24Z
---

## Goal

Achieve the stated outcome: Add forward convenience.

## Context

Add forwarding that inlines the original message and attachments.

## Boundary

Keep the work limited to the stated surface.

## Shaping

The bounded candidate is a forwarding convenience that creates a draft for human review; it must never call a send endpoint. Existing draft composition, Gmail message parsing, attachment retrieval, MIME construction, header-injection protection, and annotation-driven access gating provide the implementation seams. Selection and readiness remain unapproved.

### Scope choice requiring approval

Choose between a plain-text first delivery with explicitly selected regular attachments, and a fuller delivery preserving HTML and inline/CID parts. Plain text plus selected attachments narrows the present Goal's fidelity and must not become the accepted contract by inference. The fuller variant needs a tested MIME/CID strategy before readiness. Report unsupported content explicitly; do not silently discard inline images or attachments. Agree attachment count, per-file and total decoded-byte bounds before any allocation or provider retrieval.

### Proposed delivery steps

- [x] Confirm forwarding fidelity, attachment selection/defaults, decoded-byte bounds, and explicit caller-supplied recipients; preserve draft-only behavior.
- [x] Shape a strict input schema and bounded result, with a clear rule for forward subjects, quoted original headers/body, and unsupported content.
- [x] Add the forwarding handler under `src/main/drafts/`, reusing existing MIME and error helpers; never stage source attachments on disk merely to reuse path-based draft inputs.
- [x] Register a write-annotated draft convenience through the existing gate and update registration/smoke inventory.
- [x] Verify recipient/header injection, nested MIME, attachment selection and bounds, missing provider data, unsupported inline content, and no send calls using isolated fixtures.
- [x] Update README and user guidance; run typecheck, tests, coverage, build, smoke, and focused engineering/MCP/roadmap audits before delivery review.

### Expected files and documentation

Expected scope is `src/main/drafts/` and tests, `src/main/email/parse.ts` and tests only where fidelity requires it, `src/utils/mime.ts` and tests only for an approved MIME extension, `src/tools/drafts/index.ts`, `src/tool-registration.test.ts`, `scripts/smoke.ts`, README, and user guides. Document the chosen fidelity and attachment limits. No sending-policy dependency exists for a draft-only implementation; TOOL-004 cannot silently authorise sending here. No live mailbox operations are needed to implement or verify this slice.

## Current state

Source baseline is inspected before implementation. The current user instruction authorises autonomous completion; the coordinator reviewed this concrete boundary under outcome authority. Earlier readiness notes are historical and superseded only by the scope below.

## Steps

- [x] Deliver the bounded outcome: Add gsuite_email_draft_forward with explicit recipients, quoted original plain-text body (HTML converted to text when no plain part exists), all original attachment bytes including inline parts as ordinary attachments, maximum 50 attachments and 10 MiB total decoded bytes, and documented loss of HTML/CID visual fidelity. Never send or write temporary attachment files. Reject unsupported/malformed parts instead of silently dropping attachment data.
- [x] Review safety, existing behavior, and documentation consistency; verify fixture-backed contracts.
- [x] Run sequential typecheck, tests, coverage, build, smoke and focused audits; produce the required Review packet.

## Files touched

src/main/drafts/forward.ts and tests, src/main/drafts/index.ts, src/tools/drafts/index.ts, registration tests, smoke inventory, README, user guide, this item.

## Verify

Run `bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, `bun run ki:test:smoke`, and focused `ki-engineering`, `ki-repo-mcp`, and `ki-work-roadmap` audits. No live Google calls.

## Dependencies / blocks

No build-order dependency. The shared review report has separate topic sections; deliver TOOL-004 before TOOL-006. TOOL-005's fidelity limits were expressly admitted by the coordinator under the current outcome instruction, preserving no-send. Live integration FND-002 is excluded and independent.

## Documentation impact

### Decision Records

No new permission or architecture is granted; review conclusions preserve existing policy and name conditions for future owner decisions.

### Specifications

For forwarding, strict schemas and fixture assertions define the added contract; review items add no runtime surface.

### Guides

Publish exact forwarding semantics and durable evaluation evidence in the appropriate user/developer guides.

### Roadmap

This exact item is selected and Ready under current outcome authority; delivery stops at Awaiting review for independent coordinator acceptance.

## Review

### Delivered

Added strict write-gated gsuite_email_draft_forward and library handler. Explicit recipients, quoted plain-text original, HTML text fallback, preserved attachment bytes including inline parts as ordinary attachments, at most 50 attachments and 10 MiB decoded total. Unsupported nested attachment containers and missing/inconsistent bytes fail explicitly rather than dropping data. No send or local filesystem staging. Immutable execution baseline: `01dc0e74102c174133e0ac9dc408822e337a960a`. Current outcome authority and the exact batch admit this bounded delivery; independent coordinator review owns closure.

### Change Summary

Delivered the planned item-specific files and documentation. Earlier Draft readiness discussion is historical; current approved scope is in Steps and the batch. No scopes, send policy, token boundaries, or live provider state changed.

### Verification

Typecheck, 24 test files / 525 tests, coverage at 100% on all metrics (720 branches), build, modern/legacy stdio smoke with 50 tools and no send, focused engineering/MCP/roadmap audits passed against the proposed combined delivery. No Google account, token, or live API operation was performed. Source review covered access annotations, fixture fidelity/bounds failures, and documented policy/evaluation evidence. Aggregate gates are rechecked by the coordinator before acceptance.

### Outstanding concerns

No unresolved concern within the admitted boundary. External live integration is independently retained as MCP-GSUITE-FND-002, Draft/Waiting-for; offline verification does not claim live provider success. Forwarding's explicit HTML/CID and unsupported nested-container limits are documented behavior rather than deferred hidden fidelity work.

### Post-change review

Goal and approved scope are satisfied by the item-specific delivery. Default outbound remains human-reviewed drafts; no new sending or settings permission was inferred. The exact resulting commit requires independent coordinator review before acceptance.

### Mini recap

Delivered the bounded outcome, verified offline and recorded limits honestly. Durable policy/evaluation conclusions live in the developer guide and forwarding semantics in user guidance; no other learning promotion is proposed.

## Discussion

### Readiness review

Plan as draft-only when selected. Establish whether to forward all or selected attachments, how inline/CID parts are handled, and how current MIME/path guards apply before treating it as Ready.
