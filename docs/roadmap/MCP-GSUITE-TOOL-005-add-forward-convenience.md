---
id: MCP-GSUITE-TOOL-005
area: TOOL
title: Add forward convenience
theme: tool-surface
horizon: future
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-04T10:57:32Z
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

## Discussion

### Readiness review

Plan as draft-only when selected. Establish whether to forward all or selected attachments, how inline/CID parts are handled, and how current MIME/path guards apply before treating it as Ready.
