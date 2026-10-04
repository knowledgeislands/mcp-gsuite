---
id: MCP-GSUITE-TOOL-004
area: TOOL
title: Review sending policy
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

Achieve the stated outcome: Review sending policy.

## Context

Consider `message_send` or `draft_send` only through an explicit policy decision and opt-in environment flag, keeping drafts-only as the default.

## Boundary

Keep the work limited to the stated surface.

## Shaping

A bounded policy review can assess a requested sending workflow without enabling mail sending. Its output would be a decision packet covering the client workflow, why Gmail draft review is insufficient, permission/access gates, explicit opt-in configuration, recipient/content confirmation, retry/duplicate-send risks, audit expectations, and alternatives including retaining the current draft-only policy.

The existing Goal permits review, not a predetermined decision. No requested workflow is currently recorded, so this item remains Future/Draft. Before selection and readiness, identify the workflow and the evidence sources, agree the review output and decision owner, and define a completion test: the packet must enable an explicit owner decision while leaving sending behavior unchanged. Implementation of a send surface requires its own approved scope; broad queue progression is not a sending-policy decision.

## Discussion

### Readiness review

The present roadmap review does not choose a new sending policy. Preserve draft-only behavior and identify the requested client workflow before proposing an opt-in send surface.
