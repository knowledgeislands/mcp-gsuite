---
id: MCP-GSUITE-FND-002
area: FND
title: Gated live verification
theme: foundation-tooling
horizon: triage
status: done
intake_disposition: rejected
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-07-29T00:37:05Z
updated_at: 2026-10-05T11:03:31Z
---

## Goal

Verify the Google Workspace library against an explicitly designated disposable Google account, with consent and real-provider evidence for the permitted read-only operations.

## Context

Default tests mock Google API boundaries and CI stays offline. The stdio smoke test verifies both protocol profiles and tool registration, not a Google account. The existing `scripts/integration.ts` is a legacy untyped mcporter path that invokes only `gsuite_about`; its record/replay commands copy recordings through user mcporter state and are not an isolated verification gate.

## Boundary

No provider execution, account selection, token inspection or consent is authorised by the local delivery window. The first live slice is read-only: Gmail profile identity, Gmail labels, a bounded Calendar event listing and bounded Drive root metadata. Draft creation and cleanup, send, archive, delete and other mutations are excluded.

## Shaping

The FND-008 local infrastructure delivery supplies [the typed runner](../../src/main/integration-readonly/index.ts) and [the gated execution guide](../guides/developer/gated-read-only-integration.md), with a separate typed command, explicit opt-in, expected disposable email, dedicated token-file path, injected trusted configuration, existing real handlers and Google SDK transport tests. This resolves local implementation choices without inventing real-account authority or live success.

## Local delivery evidence

Source delivery commit `a07466c6c32380663ec2fa377f715b1704580ec0` ships the typed read-only harness and developer guide. Its offline verification passed 601 tests, all four 100% coverage metrics, TypeScript, build, Biome, Knip, modern/legacy 50-tool smoke and focused repository audits. Synthetic final-fetch transports verify actual Google SDK request construction and dedicated token-refresh persistence. No real account, credentials, consent or provider result was supplied or tested. This is local infrastructure evidence only.

## Historical waiting condition

Before withdrawal, live verification required an explicitly designated disposable account, dedicated credentials, consent and authorised provider execution. The shipped offline harness did not discharge that real-account goal.

## Intake disposition

**Rejected.** When asked whether a disposable account was available for this read-only verification, the principal explicitly answered “3 no and I don't plan to”. The adopted prospective live run is therefore withdrawn rather than left indefinitely Waiting for an account the owner does not intend to supply. This terminal intake disposition records that decline; it does not report a performed or successful live test. The completed FND-008 infrastructure remains available as an optional, explicitly gated developer harness.

## Done

Recorded the owner's declined live-verification outcome as `horizon: triage`, `status: done`, `intake_disposition: rejected`, with `baseline_ref: null`. The principal's standing instruction authorises pruning eligible committed Done records; this closure commit must precede its separate prune-only commit. Updated the developer guide to state that no live verification is planned and that any future run needs fresh designation and authority. No account, token, consent or provider call was made.

## Discussion

### Local infrastructure can proceed

An earlier assessment described all implementation as blocked by missing account details. That was too broad: guards, typed wiring, transport tests and operator guidance are locally deliverable in the child. Only real identity, credentials, consent and provider verification remain externally gated.

### Existing recording evidence

Historical commit `2597ac2b360b2dfecd1c0f3e05d5cd02805ffded` added record/replay commands and a fixture for the metadata-only script. No live command or recording has been run in this delivery window. Neither metadata replay nor a synthetic transport success establishes real API verification.

### Provider and credential boundary

The harness verifies Gmail profile email before subsequent reads. OAuth refresh may atomically rewrite its dedicated local token store at mode 0600 using the existing auth implementation; no tokens or mailbox payloads may be recorded or reported. The command does not initiate consent or reuse the ordinary token-store default.
