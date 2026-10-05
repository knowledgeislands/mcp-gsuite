---
id: MCP-GSUITE-TOOL-006
area: TOOL
title: Evaluate Gmail MCP tools
theme: tool-surface
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: e61d28690b299904d6d10c2efe6bfbaf352c4c18
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T07:52:30Z
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

- [x] Deliver the bounded outcome: Write a durable evaluation reconciling delivered filter tools and considering resources and aliases/Send-As against existing client outcomes. Recommend no added surface absent a documented unmet client need; record reopening criteria without inventing a workflow or approving extra scopes.
- [x] Review safety, existing behavior, and documentation consistency; verify fixture-backed contracts.
- [x] Run sequential typecheck, tests, coverage, build, smoke and focused audits; produce the required Review packet.

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

## Review

### Delivered

Evaluated existing filters, resources, and aliases/Send-As. Existing filter delivery reconciled; no demonstrated unmet client workflow warrants new resource/alias surface, so report recommends preserving existing tools and identifies concrete reopening evidence. Immutable execution baseline: `e61d28690b299904d6d10c2efe6bfbaf352c4c18`. Current outcome authority and the exact batch admit this bounded delivery; independent coordinator review owns closure.

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

## Done

Accepted under the named done-target MCP-GSUITE-BATCH-001 outcome authority and the principal’s standing acceptance instruction. Independent reviewer `review_housekeeping` approved the policy/settings deliveries and the corrected forwarding candidate `04c5c15863ee9cdfe804b9b1a23ab78ac77e7a7d`; 65 focused tests and the three original defect reproductions passed. Coordinator rechecked TypeScript, all 533 tests, MCP/engineering and roadmap audits on that exact combined candidate. The packet’s documented limits remain; live Google-account testing is separately Waiting for a disposable identity. No send permission or live operation was introduced.

## Discussion

### Readiness review

Current `src/tools/filters/index.ts`, `src/main/filters/index.ts`, registration tests and smoke inventory already provide filter list/create/delete. Do not re-plan these tools. Remaining evaluation concerns client-needed resources and aliases/Send-As; source delivery does not accept or close this broad item.
