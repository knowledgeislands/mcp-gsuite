---
id: MCP-GSUITE-FND-006
title: Establish audience-centric guides
area: FND
theme: foundation-tooling
horizon: now
status: ready
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-21T15:44:00Z
updated_at: 2026-09-22T07:15:00Z
---

## Goal

A reader can find practical instructions for this server grouped by the audience that needs them, and the repository declares `ki-guides` so that grouping is gated rather than conventional.

## Context

`mcp-gsuite` has no `docs/guides/` and does not declare `ki-guides`. Its README carries the whole practical account — Quick Start, a four-step Google Cloud Console setup, OAuth consent screen and scope configuration, Claude Desktop configuration, Authentication, Available Tools, Security Model and Troubleshooting. The Google Cloud setup alone is a multi-stage procedure with failure modes, which is a guide by any reasonable reading.

KI Website now declares, for every page it publishes under `apps/site/src/guidance/`, the exact upstream document and pinned ref that page was written from, and a `verify:guidance --network` sweep reports the pages whose source has moved. The site intends to derive public guidance for this project from this repository's own guides and cite them at a pinned ref, so the quality and stability of `docs/guides/` here directly determines the quality of what the site can publish.

That is a pull, not an obligation: KI Website derives, it does not own. This repository decides what its guides say and when they change.

Separately, `ki-guides` is being asked to require audience directories under `docs/guides/` rather than permitting a flat collection (`ki-agentic-harness` `KI-HARNESS-GOV-083`). If that lands, this repository's collection has to satisfy it.

## Boundary

Adopted into `Now` by explicit approval, so this is prioritised work rather than intake. It remains `status: draft`: `ki-plan` shapes it to `Ready` before any implementation, and this repository still owns its plan and sequencing.

KI Website derives and cites; it does not own this collection and must not be given approval rights over it. Nothing here requires a guide to be written for the website's benefit — if a guide would not serve this repository's own readers, it should not exist.

## Current state

There is no `docs/guides/` directory and `.ki.toml` declares no `[skills.ki-guides]` block, so nothing gates whether the collection exists or what shape it takes. The practical material catalogued in Context sits in `README.md`, where a reader arriving with a task has to reconstruct that task out of reference prose.

Two audiences read this repository today and no more. Someone running the server against their own Google account carries out the Cloud Console procedure, configures a client, authenticates, and recovers when Google refuses; someone changing the server's code runs the dev loop and adds tools. There is no hosted deployment, no fleet, and no separate operations owner, so an `operator/` directory would name an audience nobody is writing for and is rejected.

`CONTRIBUTING.md` already holds contribution mechanics — setup, commit convention, the pre-PR checklist — and stays where it is. `AGENTS.md` and `CLAUDE.md` hold the invariants an agent must not break. The developer guides cover the two procedures neither file holds: running the two processes locally, and adding a tool through the annotation-driven access gate.

## Steps

- [ ] Declare `[skills.ki-guides]` in `.ki.toml`.
- [ ] Create `docs/guides/README.md` as the collection index, routing by audience and nothing else.
- [ ] Create `docs/guides/user/` and `docs/guides/developer/`, each with its own `README.md`.
- [ ] Move the Google Cloud Console procedure out of `README.md` into `docs/guides/user/google-cloud-setup.md`.
- [ ] Move installation, prerequisites, and MCP client configuration into `docs/guides/user/installation.md`.
- [ ] Move the environment-variable reference and the access-level choice into `docs/guides/user/configuration.md`.
- [ ] Move the authentication sequence and its scope recovery into `docs/guides/user/authentication.md`.
- [ ] Move the worked example conversations and the label-name caveat into `docs/guides/user/everyday-use.md`.
- [ ] Move the troubleshooting entries into `docs/guides/user/troubleshooting.md`, routing the build-time ones to the developer collection.
- [ ] Move the dev loop and the repository layout into `docs/guides/developer/local-development.md`.
- [ ] Move the tool-extension procedure into `docs/guides/developer/adding-a-tool.md`.
- [ ] Leave `README.md` orienting: what the server is, what it can do, where its guides are, and its security posture.
- [ ] Run the guides and authoring audits and repair what they report.

## Files touched

`docs/guides/README.md`, `docs/guides/user/` (index plus six guides), `docs/guides/developer/` (index plus two guides), `.ki.toml`, `README.md`.

## Verify

`ki repo audit --skill ki-guides --repo .` passes, `ki repo audit --skill ki-authoring --repo .` passes over the new Markdown, and the full `ki repo audit --repo .` still passes across every declared skill. No source file changes, so the package gates are unaffected.

## Dependencies / blocks

Nothing blocks this. `KI-HARNESS-GOV-083` in `ki-agentic-harness` proposes making audience directories a `ki-guides` requirement: if it lands first this collection satisfies it by construction, and if it lands later this collection already conforms. KI Website intends to derive public guidance from these guides and cite them at a pinned ref, but it derives rather than owns and its schedule does not gate this work.

## Documentation impact

### Decision Records

No decision record is needed. Audience-centric grouping is the house arrangement `ki-guides` already encodes, so adopting it here is conformance rather than a new decision. One becomes owed only if this repository concludes it needs an exception.

### Specifications

No behaviour-level contract changes. The server's tool surface is untouched; this item changes only where its instructions live and who they are written for. The tool inventory is reference rather than procedure and does not become a guide; it stays in `README.md` until this repository declares `ki-specs` or generates the surface from the tool declarations.

### Guides

This item is entirely guide impact. It creates the collection, its audience directories, and their indexes, and it empties the README of instruction.

### Roadmap

No further roadmap change is expected. If writing the guides exposes behaviour that cannot honestly be explained — an unclear failure mode, a configuration step with no recovery — that is a separate item raised at the time.

## Discussion

### The prompting question

Shaping settles how far the restructure goes, not whether it happens. The prompting question is whether a reader who has never opened this repository can install it, run it, and recover from its common failures without reading source.

### Audiences

`user/` and `developer/` are the two audiences this server has. An `operator/` split was considered and rejected: the server is a local stdio process started by the reader's own MCP client against the reader's own Google account, so operating it and using it are the same job done by the same person. Nobody runs this for somebody else, and a directory named for an audience with no reader is worse than no directory.

### The tool inventory

A hand-maintained tool inventory does not become a guide. Two reasons. It is reference rather than procedure, and `ki-guides` is explicit that a guide is not a second specification; and the existing inventory already demonstrates the drift failure — `README.md` claims thirty-two tools "all prefixed `gsuite_email_`" while `scripts/smoke.ts` asserts forty-two across email, calendar, Drive and Sheets. Promoting that list into `docs/guides/` would move a stale artefact into a governed collection and imply it was maintained.

The inventory therefore stays in `README.md`, where the reader can see it alongside the feature summary, and the guides link to it rather than restate it. The authoritative surface remains what the running server reports through `tools/list`, which is what the smoke test compares against.

The stale counts are corrected in passing, because the user guides have to tell a reader what the server can do and an inventory missing a quarter of the surface would make them wrong too. That is a bounded correction against `src/tools/` and `scripts/smoke.ts`, not an undertaking to maintain the list by hand. The durable answer is a `ki-specs` declaration owning the tool surface or generation from the tool declarations; neither is in this item's boundary, and the evidence is recorded here for whoever takes it up.
