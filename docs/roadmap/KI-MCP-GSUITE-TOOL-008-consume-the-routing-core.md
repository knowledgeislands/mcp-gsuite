---
id: KI-MCP-GSUITE-TOOL-008
area: TOOL
title: Consume the routing core
kind: deliver
horizon: hold
hold:
  reason: waiting-for
  condition: until Kris resumes Humans not Robots work, when hnr.email-routing chooses a horizon afresh (EMAIL-OWNER, Kris, 20 October)
status: draft
blocks: [KI-MCP-GSUITE-TOOL-009]
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T00:25:46Z
updated_at: 2026-10-19T23:24:19Z
---

## Goal

This server holds an exact, checked revision of the shared mailbox-neutral routing core, and a check fails when that copy drifts from its source or falls stale.

## Context

The [Gmail routing design](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_WORK/hnr.email-routing/design/2026-10-17-gmail-routing-design.md) reuses the routing engine `mcp-m365` runs, about 80% of which is already provider-free, rather than writing a second engine. `mcp-m365` gathers that core behind a provider port in [KI-MCP-M365-TOOL-018](/Users/krisbrown/workspaces/knowledge-islands/mcp-m365/docs/roadmap/KI-MCP-M365-TOOL-018-extract-the-routing-core.md) and makes it available to other servers in [KI-MCP-M365-TOOL-020](/Users/krisbrown/workspaces/knowledge-islands/mcp-m365/docs/roadmap/KI-MCP-M365-TOOL-020-distribute-the-routing-core.md). This is the design's task 4, in phase 1.

## Boundary

Take the core and prove it unchanged; no Gmail behaviour, no tools and no mailbox access. The core's rule semantics stay owned by the rule-language specification, which this server conforms to as an email-handling implementation.

The core arrives by vendoring (ENGINE-HOME, answered 18 October 2026): a byte-identical copy of `mcp-m365`'s provider-free core directory, with the manifest of source revision and SHA-256 digests that [KI-MCP-M365-TOOL-020](/Users/krisbrown/workspaces/knowledge-islands/mcp-m365/docs/roadmap/KI-MCP-M365-TOOL-020-distribute-the-routing-core.md) publishes, in the `ki-repo-mcp` shared-code format this repository already uses for its access-gate code. This record's deliverable is the consumer side: the vendored copy, its manifest, and a drift check in the gates. Fixes go to the canonical copy in `mcp-m365` and are re-vendored, never edited here. No pinned Git reference or package dependency is added.

## Shaping

- **Approach:** vendor the core from a named `mcp-m365` revision with its manifest, and add the drift check that compares the copy against the manifest and the manifest against that revision.
- **Dependencies:** KI-MCP-M365-TOOL-018 and KI-MCP-M365-TOOL-020 delivered.
- **Open decisions:** none.
- **Promotion to Next:** the core and its manifest available at a named `mcp-m365` revision.

## Hold

Held until a Project opens to own email routing (LANE-OWNERS, Kris, 19 October). Kris answered LANE-OWNERS a) on 19 October 2026: the email-routing draft records in mcp-m365 and mcp-gsuite wait in one hold until a Project opens to own them. The record was at `horizon: soon` before the hold; release chooses a horizon afresh once that Project exists.

Re-validated on 20 October 2026 under TO-DONE: the hold stays. Kris answered EMAIL-OWNER on 20 October ("if that's all to do with H and R, it can go to the H and R area"), so the Project the condition waited for exists, [hnr.email-routing](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_WORK/hnr.email-routing/work.md), and owns these records; that Project is itself paused until Kris resumes Humans not Robots work, which is now the release condition.

## Discussion

### Verification

The drift check passes on a fresh copy and fails when one byte of the copy or the manifest changes; the core's own tests run here unchanged against its fixtures.

### Engine home

The owner answered ENGINE-HOME with option a) on 18 October 2026 (Decision 21 in the email-routing thread's [decisions](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_WORK/hnr.email-routing/decisions.md)): canonical engine in `mcp-m365` in a provider-free directory behind a provider port, vendored here with a SHA-256 manifest and a drift check. A separate repository waits until a third provider appears.

### Intake authority

Captured on 18 October 2026 under the owner's CAPTURE-RECORDS answer, "Phases 0-1 only", which asked for design tasks 1-5, 8 and 9 as drafts. The design's title, "Vendor the routing core with a drift check", presumed vendoring; this one is neutral. The horizon is the capturing agent's placement, not the owner's. Capture grants no priority, Ready transition, implementation, acceptance or publication authority.
