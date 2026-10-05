---
id: MCP-GSUITE-TOOL-006
area: TOOL
title: Evaluate Gmail MCP tools
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

Achieve the stated outcome: Evaluate MCP resources and Gmail settings tools.

## Context

Evaluate resource exposure, filter management, and aliases/Send-As tools only if a client need justifies their additional surface area.

## Boundary

Keep the work limited to the stated surface.

## Shaping

Fresh source review confirms filter list/create/delete in `src/main/filters/index.ts` and `src/tools/filters/index.ts`, with registration and smoke inventory coverage. Reconcile that delivered portion instead of proposing duplicate filter tools. The remaining work is an evidence-led evaluation of MCP resources and aliases/Send-As against a named client workflow.

A bounded evaluation deliverable would map existing tools and client capabilities, identify any missing outcome, compare a resource or aliases surface with existing calls, and recommend additions or explicitly recommend no addition. It must preserve OAuth scope, access-level, token-redaction, and draft-only boundaries. No client need is established today; do not invent one to make the item Ready. Selection requires agreement on the evaluation's evidence sources and output, and any implementation recommendation remains a separate approval. Catalogue generation is a maintenance decision outside this item's current Goal.

## Current state

Source baseline is inspected before implementation. The current user instruction authorises autonomous completion; the coordinator reviewed this concrete boundary under outcome authority. Earlier readiness notes are historical and superseded only by the scope below.

## Steps

- [ ] Deliver the bounded outcome: Write a durable evaluation reconciling delivered filter tools and considering resources and aliases/Send-As against existing client outcomes. Recommend no added surface absent a documented unmet client need; record reopening criteria without inventing a workflow or approving extra scopes.
- [ ] Review safety, existing behavior, and documentation consistency; verify fixture-backed contracts.
- [ ] Run sequential typecheck, tests, coverage, build, smoke and focused audits; produce the required Review packet.

## Files touched

docs/guides/developer/outbound-and-settings-review.md, developer guide index, this item.

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

Current `src/tools/filters/index.ts`, `src/main/filters/index.ts`, registration tests and smoke inventory already provide filter list/create/delete. Do not re-plan these tools. Remaining evaluation concerns client-needed resources and aliases/Send-As; source delivery does not accept or close this broad item.
