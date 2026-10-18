---
id: KI-MCP-GSUITE-TOOL-008
area: TOOL
title: Consume the routing core
kind: deliver
horizon: soon
status: draft
blocks: [KI-MCP-GSUITE-TOOL-009]
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T00:31:00Z
updated_at: 2026-10-18T00:31:00Z
---

## Goal

This server holds an exact, checked revision of the shared mailbox-neutral routing core, and a check fails when that copy drifts from its source or falls stale.

## Context

The [Gmail routing design](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/email-routing/2026-10-17-gmail-routing-design.md) reuses the routing engine `mcp-m365` runs, about 80% of which is already provider-free, rather than writing a second engine. `mcp-m365` gathers that core behind a provider port in [KI-MCP-M365-TOOL-018](/Users/krisbrown/workspaces/knowledge-islands/mcp-m365/docs/roadmap/KI-MCP-M365-TOOL-018-extract-the-routing-core.md) and makes it available to other servers in [KI-MCP-M365-TOOL-020](/Users/krisbrown/workspaces/knowledge-islands/mcp-m365/docs/roadmap/KI-MCP-M365-TOOL-020-distribute-the-routing-core.md). This is the design's task 4, in phase 1.

## Boundary

Take the core and prove it unchanged; no Gmail behaviour, no tools and no mailbox access. The core's rule semantics stay owned by the rule-language specification, which this server conforms to as an email-handling implementation.

How the core arrives is still open (the ENGINE-HOME question). The design recommends a vendored, byte-identical copy with a manifest of source revision and SHA-256 digests in the `ki-repo-mcp` shared-code format, which this repository already uses for its access-gate code. The alternatives are a pinned Git reference to a separate repository, or a published package, which needs the owner's approval. This record does not presume the answer: its deliverable is the consumer side of whichever the owner chooses.

## Shaping

- **Approach:** after ENGINE-HOME, either vendor the core with its manifest and drift check, or add the pinned dependency and a revision check.
- **Dependencies:** KI-MCP-M365-TOOL-018 and KI-MCP-M365-TOOL-020 delivered.
- **Open decisions:** ENGINE-HOME.
- **Promotion to Next:** ENGINE-HOME answered and the core available at a named revision.

## Discussion

### Verification

The drift check passes on a fresh copy and fails when one byte of the copy or the manifest changes; the core's own tests run here unchanged against its fixtures.

### Intake authority

Captured on 18 October 2026 under the owner's CAPTURE-RECORDS answer, "Phases 0-1 only", which asked for design tasks 1-5, 8 and 9 as drafts. The design's title, "Vendor the routing core with a drift check", presumed vendoring; this one is neutral. The horizon is the capturing agent's placement, not the owner's. Capture grants no priority, Ready transition, implementation, acceptance or publication authority.
