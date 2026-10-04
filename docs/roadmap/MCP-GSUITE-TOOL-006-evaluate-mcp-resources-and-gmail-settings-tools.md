---
id: MCP-GSUITE-TOOL-006
area: TOOL
title: Evaluate Gmail MCP tools
theme: tool-surface
horizon: future
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-04T10:57:33Z
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

## Discussion

### Readiness review

Current `src/tools/filters/index.ts`, `src/main/filters/index.ts`, registration tests and smoke inventory already provide filter list/create/delete. Do not re-plan these tools. Remaining evaluation concerns client-needed resources and aliases/Send-As; source delivery does not accept or close this broad item.
