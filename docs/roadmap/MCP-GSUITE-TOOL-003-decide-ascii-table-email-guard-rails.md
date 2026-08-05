---
id: MCP-GSUITE-TOOL-003
title: Decide email table guards
theme: tool-surface
horizon: soon
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Achieve the stated outcome: Decide ASCII-table email guard rails.

## Context

Choose whether HTML email bodies containing ASCII tables should be rejected with guidance, converted, or documented as-is.

## Boundary

Keep the work limited to the stated surface.

## Shaping

Today the server does nothing at all here. `bodyHtml` on the draft tools is typed as `bodyTextSchema` — a bare length-capped string in `src/utils/schemas.ts` — and `buildRfc2822` in `src/utils/mime.ts` passes it through byte-for-byte, normalising line endings and nothing else. The only content validation anywhere in that path is newline rejection on recipients and subject, which guards header injection rather than rendering. An ASCII table written into `bodyHtml` therefore reaches the recipient as HTML, where runs of whitespace collapse and the column alignment is lost.

The three outcomes named in Context sit at very different costs, so the shaping work is to price them before choosing. Documenting the behaviour is a tool-description and README edit. Rejecting means a refinement on the `bodyHtml` schema and a decision about what pattern counts as an ASCII table. Converting means a transform in `src/utils/mime.ts`, which is the highest-risk option because that module is the shared message builder.

There is a fourth answer worth pricing alongside them: the composition path already supports supplying both `bodyText` and `bodyHtml`, in which case `buildRfc2822` emits `multipart/alternative` with the plain-text part first. The plain-text alternative preserves the spacing the HTML part collapses, so the guidance may simply be "put the table in `bodyText`" with no code change beyond the tool description.

There are no external dependencies. The item shares `src/utils/mime.ts` with any future body-composing work, including [MCP-GSUITE-TOOL-005](MCP-GSUITE-TOOL-005-add-forward-convenience.md) at the `future` horizon, which is a reason to prefer a schema- or documentation-level answer over a transform in the shared builder.

The decisions still needed are whether detection is worth its false positives, whether rejecting a caller's body is proportionate given that the server only ever creates drafts, and whether the outcome needs any code at all.

This item should be promoted only once the outcome is chosen and that outcome turns out to need implementation; if the answer is documentation, it can be closed directly from the decision.

## Discussion

### Detection is unavoidably heuristic

Any rule that spots an ASCII table — runs of spaces, box-drawing characters, pipe-delimited rows — will also fire on legitimate HTML that happens to contain them, including preformatted blocks that already render correctly. A guard rail that rejects valid bodies is worse than the problem it prevents, which is the strongest argument against the rejection outcome.

### The server never sends

Drafts are the entire mutating surface for composition: the user opens the draft in Gmail and reviews it before anything leaves the account. A mis-rendered table is visible at that point and costs an edit, not a retraction. That materially lowers the stakes and favours guidance over enforcement.

### Whether this is a code change at all

It is entirely possible the right answer is a sentence in the `bodyHtml` description pointing callers at `bodyText` for monospace content. That would be a legitimate close for a "decide" item, and it is worth stating up front so the decision is not biased towards shipping something.
