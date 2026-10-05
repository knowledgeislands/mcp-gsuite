---
id: MCP-GSUITE-TOOL-004
area: TOOL
title: Review sending policy
theme: tool-surface
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 87d94c75242f511c75a4824bef4454302e282286
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T07:52:30Z
---

## Goal

Achieve the stated outcome: Review sending policy.

## Context

Consider `message_send` or `draft_send` only through an explicit policy decision and opt-in environment flag, keeping drafts-only as the default.

## Boundary

Keep the work limited to the stated surface.

## Shaping

A bounded policy review can assess a requested sending workflow without enabling mail sending. Its output would be a decision packet covering the client workflow, why Gmail draft review is insufficient, permission/access gates, explicit opt-in configuration, recipient/content confirmation, retry/duplicate-send risks, audit expectations, and alternatives including retaining the current draft-only policy.

The existing Goal permits review, not a predetermined decision. No requested workflow is currently recorded, so this item remains Future/Draft. Before selection and readiness, identify the workflow and the evidence sources, agree the review output and decision owner, and define a completion test: the packet must enable an explicit owner decision while leaving sending behavior unchanged. Implementation of a send surface requires its own approved scope; broad queue progression is not a sending-policy decision.

## Current state

Source baseline is inspected before implementation. The current user instruction authorises autonomous completion; the coordinator reviewed this concrete boundary under outcome authority. Earlier readiness notes are historical and superseded only by the scope below.

## Steps

- [x] Deliver the bounded outcome: Write a durable review recommending retention of the existing draft-only policy. Assess explicit-send alternatives, recipient confirmation, retries/duplicate delivery, opt-in gates, and absent workflow evidence. No sending implementation or new policy permission.
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

Reviewed explicit-send alternatives and retained existing draft-only policy; no send tool or new permission introduced. Durable report records absent workflow evidence and explicit reopening criteria. Immutable execution baseline: `87d94c75242f511c75a4824bef4454302e282286`. Current outcome authority and the exact batch admit this bounded delivery; independent coordinator review owns closure.

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

The present roadmap review does not choose a new sending policy. Preserve draft-only behavior and identify the requested client workflow before proposing an opt-in send surface.
