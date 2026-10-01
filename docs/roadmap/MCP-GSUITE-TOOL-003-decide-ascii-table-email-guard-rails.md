---
id: MCP-GSUITE-TOOL-003
area: TOOL
title: Decide email table guards
theme: tool-surface
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 1b32e4e806260d0911634062ba80add863e9c8e1
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-01T20:36:07Z
---

## Goal

Callers have clear guidance for composing readable email tables without unexpected rejection or transformation of their draft content.

## Context

Choose whether HTML email bodies containing ASCII tables should be rejected with guidance, converted, or documented as-is.

## Boundary

Improve caller guidance for draft composition only. Do not reject or transform bodies, introduce an HTML parser, or add sending.

## Current state

Draft creation and update accept HTML strings, and `buildRfc2822` preserves caller content apart from line endings. Draft creation already supports plain-text/HTML alternatives. Heuristic table detection would also match valid preformatted HTML.

## Steps

- [x] Choose guidance as the outcome: use actual HTML tables or escaped preformatted HTML in `bodyHtml`, and use `bodyText` for a plain-text fallback; explain that the chosen HTML part still must render correctly.
- [x] Add concise guidance to create/update body descriptions and the README composition examples. Preserve the existing schemas and MIME transformation behavior.
- [x] Check examples against both draft shapes and confirm the existing MIME and registration tests still pass; record the guidance decision in this item.

## Files touched

`src/tools/drafts/index.ts`, `README.md`, and this work item; no MIME-builder behavior change.

## Verify

Run `bunx tsc --noEmit`, `bun run test`, `bun run build`, `bun run ki:test:smoke`, and focused `ki-authoring`/`ki-work-roadmap` audits. Inspect that no validation/transform was introduced and both body fields remain available.

## Dependencies / blocks

No build-order blocker. Serialize edits to shared tool registration and smoke inventories with sibling mail items; landing order is a coordination preference, not a dependency.

## Documentation impact

### Decision Records

Keep the small composition-guidance decision here; no architectural Decision Record is needed.

### Specifications

No schema or behavior change; accepted body content remains unchanged.

### Guides

Add an example for readable HTML tables plus plain-text alternatives.

### Roadmap

Keep this item as the execution authority; record delivery and review evidence here without accepting or pruning other work.

## Review

### Delivered

Added draft-composition guidance at baseline `1b32e4e806260d0911634062ba80add863e9c8e1`. Callers are directed to use real HTML tables or escaped preformatted HTML, pair `bodyHtml` with `bodyText` when a fallback helps, and review the resulting HTML in Gmail.

### Change Summary

Updated create and update body-field descriptions and added a compact README example. No schema validators, MIME builder, tool registration, or sending behavior changed. The decision is guidance rather than heuristic rejection or conversion.

### Verification

`bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, and `bun run ki:test:smoke` passed. The existing MIME and registration fixtures remained green; the code diff changes descriptions only. Focused `ki-authoring` and `ki-work-roadmap` audits passed.

### Outstanding concerns

HTML rendering depends on the mail client and caller content. The plain-text alternative does not repair malformed HTML; Gmail draft review remains the check before sending.

### Post-change review

The guidance avoids rejecting valid preformatted bodies and preserves both draft body fields. The example uses the supported create/update shape, and the server still only saves drafts. Ready for owner acceptance of this exact candidate.

### Mini recap

The narrow guidance decision and its verification are recorded here. No external mail account or live draft was accessed, and the item remains Awaiting review until explicit acceptance.

## Discussion

### Detection is unavoidably heuristic

Any rule that spots an ASCII table — runs of spaces, box-drawing characters, pipe-delimited rows — will also fire on legitimate HTML that happens to contain them, including preformatted blocks that already render correctly. A guard rail that rejects valid bodies is worse than the problem it prevents, which is the strongest argument against the rejection outcome.

### The server never sends

Drafts are the entire mutating surface for composition: the user opens the draft in Gmail and reviews it before anything leaves the account. A mis-rendered table is visible at that point and costs an edit, not a retraction. That materially lowers the stakes and favours guidance over enforcement.

### Whether this is a code change at all

It is entirely possible the right answer is a sentence in the `bodyHtml` description pointing callers at `bodyText` for monospace content. That would be a legitimate close for a "decide" item, and it is worth stating up front so the decision is not biased towards shipping something.

### Readiness review

The selected outcome is documentation, not heuristic rejection or conversion. A plain-text alternative does not fix malformed HTML when a client chooses the HTML part. Documentation delivery still follows normal implementation/review/acceptance; the earlier suggestion of direct closure is not the governing lifecycle.
