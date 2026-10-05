---
id: MCP-GSUITE-FND-002
area: FND
title: Gated live verification
theme: foundation-tooling
horizon: waiting-for
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T08:13:22Z
---

## Goal

Verify the Google Workspace library against an explicitly designated disposable Google account, with consent and real-provider evidence for the permitted read-only operations.

## Context

Default tests mock Google API boundaries and CI stays offline. The stdio smoke test verifies both protocol profiles and tool registration, not a Google account. The existing `scripts/integration.ts` is a legacy untyped mcporter path that invokes only `gsuite_about`; its record/replay commands copy recordings through user mcporter state and are not an isolated verification gate.

## Boundary

No provider execution, account selection, token inspection or consent is authorised by the local delivery window. The first live slice is read-only: Gmail profile identity, Gmail labels, a bounded Calendar event listing and bounded Drive root metadata. Draft creation and cleanup, send, archive, delete and other mutations are excluded.

## Shaping

The FND-008 local infrastructure delivery supplies [the typed runner](../../src/main/integration-readonly/index.ts) and [the gated execution guide](../guides/developer/gated-read-only-integration.md), with a separate typed command, explicit opt-in, expected disposable email, dedicated token-file path, injected trusted configuration, existing real handlers and Google SDK transport tests. This resolves local implementation choices without inventing real-account authority or live success.

## Waiting-for condition

The principal must designate the disposable Google account email and dedicated credential source, confirm consent for the documented read-only run, and permit provider execution. Once those are supplied, run the shipped harness against that exact account and retain redacted evidence of identity verification and successful provider reads, including any missing scopes or provider errors. Synthetic fixtures cannot discharge this goal. Remain Waiting-for / Draft until those conditions are met.

## Discussion

### Local infrastructure can proceed

An earlier assessment described all implementation as blocked by missing account details. That was too broad: guards, typed wiring, transport tests and operator guidance are locally deliverable in the child. Only real identity, credentials, consent and provider verification remain externally gated.

### Existing recording evidence

Historical commit `2597ac2b360b2dfecd1c0f3e05d5cd02805ffded` added record/replay commands and a fixture for the metadata-only script. No live command or recording has been run in this delivery window. Neither metadata replay nor a synthetic transport success establishes real API verification.

### Provider and credential boundary

The harness verifies Gmail profile email before subsequent reads. OAuth refresh may atomically rewrite its dedicated local token store at mode 0600 using the existing auth implementation; no tokens or mailbox payloads may be recorded or reported. The command does not initiate consent or reuse the ordinary token-store default.
