---
id: MCP-GSUITE-TOOL-005
area: TOOL
title: Add forward convenience
theme: tool-surface
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T07:36:17Z
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

- [ ] Confirm forwarding fidelity, attachment selection/defaults, decoded-byte bounds, and explicit caller-supplied recipients; preserve draft-only behavior.
- [ ] Shape a strict input schema and bounded result, with a clear rule for forward subjects, quoted original headers/body, and unsupported content.
- [ ] Add the forwarding handler under `src/main/drafts/`, reusing existing MIME and error helpers; never stage source attachments on disk merely to reuse path-based draft inputs.
- [ ] Register a write-annotated draft convenience through the existing gate and update registration/smoke inventory.
- [ ] Verify recipient/header injection, nested MIME, attachment selection and bounds, missing provider data, unsupported inline content, and no send calls using isolated fixtures.
- [ ] Update README and user guidance; run typecheck, tests, coverage, build, smoke, and focused engineering/MCP/roadmap audits before delivery review.

### Expected files and documentation

Expected scope is `src/main/drafts/` and tests, `src/main/email/parse.ts` and tests only where fidelity requires it, `src/utils/mime.ts` and tests only for an approved MIME extension, `src/tools/drafts/index.ts`, `src/tool-registration.test.ts`, `scripts/smoke.ts`, README, and user guides. Document the chosen fidelity and attachment limits. No sending-policy dependency exists for a draft-only implementation; TOOL-004 cannot silently authorise sending here. No live mailbox operations are needed to implement or verify this slice.

## Current state

Source baseline is inspected before implementation. The current user instruction authorises autonomous completion; the coordinator reviewed this concrete boundary under outcome authority. Earlier readiness notes are historical and superseded only by the scope below.

## Steps

- [ ] Deliver the bounded outcome: Add gsuite_email_draft_forward with explicit recipients, quoted original plain-text body (HTML converted to text when no plain part exists), all original attachment bytes including inline parts as ordinary attachments, maximum 50 attachments and 10 MiB total decoded bytes, and documented loss of HTML/CID visual fidelity. Never send or write temporary attachment files. Reject unsupported/malformed parts instead of silently dropping attachment data.
- [ ] Review safety, existing behavior, and documentation consistency; verify fixture-backed contracts.
- [ ] Run sequential typecheck, tests, coverage, build, smoke and focused audits; produce the required Review packet.

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

## Discussion

### Readiness review

Plan as draft-only when selected. Establish whether to forward all or selected attachments, how inline/CID parts are handled, and how current MIME/path guards apply before treating it as Ready.
