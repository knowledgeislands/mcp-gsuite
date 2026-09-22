---
id: MCP-GSUITE-FND-006
title: Establish audience-centric guides
area: FND
theme: foundation-tooling
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: e28c7eb80ae53e05926bb565aeea1c30cc42910b
created_at: 2026-09-21T15:44:00Z
updated_at: 2026-09-22T07:21:56Z
---

## Goal

A reader can find practical instructions for this server grouped by the audience that needs them, and the repository declares `ki-guides` so that grouping is gated rather than conventional.

## Context

`mcp-gsuite` has no `docs/guides/` and does not declare `ki-guides`. Its README carries the whole practical account — Quick Start, a four-step Google Cloud Console setup, OAuth consent screen and scope configuration, Claude Desktop configuration, Authentication, Available Tools, Security Model and Troubleshooting. The Google Cloud setup alone is a multi-stage procedure with failure modes, which is a guide by any reasonable reading.

KI Website now declares, for every page it publishes under `apps/site/src/guidance/`, the exact upstream document and pinned ref that page was written from, and a `verify:guidance --network` sweep reports the pages whose source has moved. The site intends to derive public guidance for this project from this repository's own guides and cite them at a pinned ref, so the quality and stability of `docs/guides/` here directly determines the quality of what the site can publish.

That is a pull, not an obligation: KI Website derives, it does not own. This repository decides what its guides say and when they change.

Separately, `ki-guides` is being asked to require audience directories under `docs/guides/` rather than permitting a flat collection (`ki-agentic-harness` `KI-HARNESS-GOV-083`). If that lands, this repository's collection has to satisfy it.

## Boundary

Adopted into `Now` by explicit approval, so this is prioritised work rather than intake. `ki-plan` shaped it to `Ready` before implementation began, and this repository still owns its plan and sequencing.

KI Website derives and cites; it does not own this collection and must not be given approval rights over it. Nothing here requires a guide to be written for the website's benefit — if a guide would not serve this repository's own readers, it should not exist.

## Current state

There is no `docs/guides/` directory and `.ki.toml` declares no `[skills.ki-guides]` block, so nothing gates whether the collection exists or what shape it takes. The practical material catalogued in Context sits in `README.md`, where a reader arriving with a task has to reconstruct that task out of reference prose.

Two audiences read this repository today and no more. Someone running the server against their own Google account carries out the Cloud Console procedure, configures a client, authenticates, and recovers when Google refuses; someone changing the server's code runs the dev loop and adds tools. There is no hosted deployment, no fleet, and no separate operations owner, so an `operator/` directory would name an audience nobody is writing for and is rejected.

`CONTRIBUTING.md` already holds contribution mechanics — setup, commit convention, the pre-PR checklist — and stays where it is. `AGENTS.md` and `CLAUDE.md` hold the invariants an agent must not break. The developer guides cover the two procedures neither file holds: running the two processes locally, and adding a tool through the annotation-driven access gate.

## Steps

- [x] Declare `[skills.ki-guides]` in `.ki.toml`.
- [x] Create `docs/guides/README.md` as the collection index, routing by audience and nothing else.
- [x] Create `docs/guides/user/` and `docs/guides/developer/`, each with its own `README.md`.
- [x] Move the Google Cloud Console procedure out of `README.md` into `docs/guides/user/google-cloud-setup.md`.
- [x] Move installation, prerequisites, and MCP client configuration into `docs/guides/user/installation.md`.
- [x] Move the environment-variable reference and the access-level choice into `docs/guides/user/configuration.md`.
- [x] Move the authentication sequence and its scope recovery into `docs/guides/user/authentication.md`.
- [x] Move the worked example conversations and the label-name caveat into `docs/guides/user/everyday-use.md`.
- [x] Move the troubleshooting entries into `docs/guides/user/troubleshooting.md`, routing the build-time ones to the developer collection.
- [x] Move the dev loop and the repository layout into `docs/guides/developer/local-development.md`.
- [x] Move the tool-extension procedure into `docs/guides/developer/adding-a-tool.md`.
- [x] Leave `README.md` orienting: what the server is, what it can do, where its guides are, and its security posture.
- [x] Run the guides and authoring audits and repair what they report.

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

No further roadmap change is expected. Writing the guides did expose two defects that are not this item's to fix; both are recorded under Outstanding concerns for capture as their own items.

## Review

### Delivered

The approved boundary held: an audience-centric guide collection under `docs/guides/`, the README's how-to material moved rather than copied, `[skills.ki-guides]` declared, and nothing written for the KI Website's benefit. Excluded, as planned: any change to the server's behaviour or tool surface, any Decision Record, and any `ki-specs` adoption.

Immutable baseline: `e28c7eb80ae53e05926bb565aeea1c30cc42910b`.

Two audiences were named and one was rejected. `user/` is someone running the server against their own Google account; `developer/` is someone changing its code. `operator/` was rejected because the server is a local stdio process started by the reader's own client against the reader's own account — operating it and using it are the same job done by the same person, and a directory named for a reader who does not exist is worse than no directory.

### Summary of changes

Eleven new files under `docs/guides/`: the collection index, a `user/` index with six guides (`google-cloud-setup.md`, `installation.md`, `configuration.md`, `authentication.md`, `everyday-use.md`, `troubleshooting.md`), and a `developer/` index with two (`local-development.md`, `adding-a-tool.md`).

`README.md` lost 313 lines of instruction and kept its orientation: identity, features, a Documentation section routing to the guides in reading order, the tool inventory, and the security model. Quick Start, Example Conversations, Installation, Google Cloud Console Setup, Configuration, Authentication, Troubleshooting, Directory Structure, Development and Extending the Server are all gone from it — moved, not copied. Nothing links to a removed anchor; the only inbound reference, from `CLAUDE.md`, points at `#available-tools`, which remains.

`.ki.toml` declares `[skills.ki-guides]` under governance and runtime, matching the placement in `tools-mgit` and `tools-git-almanac`.

Two approved deviations, both inside `README.md` and both corrections of statements that were already false:

- The tool inventory said "32 tools across six areas, all prefixed `gsuite_email_`" and the opening sentence said calendar and Drive/Sheets tools were still to come. `scripts/smoke.ts` has asserted forty-two tools since the initial commit. The headline now states the true surface, tables for the six calendar tools and the four Drive/Sheets tools were added from `src/tools/calendar/` and `src/tools/drive/`, and the level counts (18 read, 21 write, 3 destructive) were derived from the annotation presets. Leaving this uncorrected would have propagated into the user guides, which have to tell a reader what the server can do.
- The npm version badge was left alone despite `@knowledgeislands/mcp-gsuite` returning 404 from the registry; the guides therefore document the source install only and invent no `npx` route.

### Verification

- `ki repo audit --skill ki-guides --repo . --concise --progress never` — `summary: KI REPO AUDIT on mcp-gsuite PASS · 1 skill`, exit 0.
- `ki repo audit --skill ki-authoring --repo . --concise --progress never` — `summary: KI REPO AUDIT on mcp-gsuite PASS · 1 skill`, exit 0.
- `ki repo audit --repo . --concise --progress never` — `summary: KI REPO AUDIT on mcp-gsuite PASS · 16 skills`, exit 0. Fifteen before this change; `ki-guides` is the sixteenth.
- `rumdl check docs/guides README.md` — `Success: No issues found in 12 files`.
- Every relative link in the new guides and the rewritten README resolves to a file that exists, checked mechanically.
- The package gates were not run: no file under `src/`, `scripts/`, or any build configuration was touched, so nothing they cover changed.

### Outstanding concerns

Two defects were found while writing and deliberately not fixed here, because both are code or publication changes outside this item's boundary:

- `src/main/auth-info/index.ts` tells the reader to start the auth server with `bun run server:auth:dev` or `server:auth:start`. Neither script exists; they were renamed to the `ki:` prefix. The guides document the working commands, but the tool's own message is wrong and a reader who follows it will fail. `CONTRIBUTING.md` similarly lists a `ki:lint:md` script that no longer exists.
- The README's npm version badge points at a package that is not published, so it renders as a dead link. Removing it, or publishing, is a decision for the repository owner rather than a documentation fix.

Neither blocks acceptance of this item.

### Post-change review

The goal is met on its own test: a reader who has never opened this repository can now create Google credentials, install and configure the server, authenticate, work with it, and recover from its documented failures without reading source, and each of those is one guide rather than a section of a 27 KB README.

Scope held. Regression risk is confined to documentation — no code, build, or configuration behaviour changed, and the one configuration change adds a skill declaration whose checker passes. The residual risk is the usual one for guides: procedural truth. The Google Cloud steps, environment variables, scripts and failure modes were each checked against `src/`, `package.json`, `.env.example` and `scripts/smoke.ts` rather than copied forward on trust, and the two places where the README had drifted from the code are exactly what that checking found.

Ready for acceptance review, subject to a human judging the guides' placement and prose rather than their mechanics.

### Mini recap

Delivered an eleven-file audience-centric guide collection, emptied the README of instruction, and declared `ki-guides`, which now gates the result. Verification: three `ki repo audit` runs and `rumdl`, all passing, with the full audit rising from fifteen to sixteen skills. Concerns: a stale script name in `gsuite_auth_start`'s own message, a stale script name in `CONTRIBUTING.md`, and an npm badge for an unpublished package — all recorded above, none blocking. Learning worth routing rather than promoting automatically: a hand-maintained inventory drifted from the code for the entire life of this repository without anyone noticing, which is an argument for `ki-specs` or generation here and a caution worth carrying to the other MCP repositories.

## Discussion

### The prompting question

Shaping settles how far the restructure goes, not whether it happens. The prompting question is whether a reader who has never opened this repository can install it, run it, and recover from its common failures without reading source.

### Audiences

`user/` and `developer/` are the two audiences this server has. An `operator/` split was considered and rejected: the server is a local stdio process started by the reader's own MCP client against the reader's own Google account, so operating it and using it are the same job done by the same person. Nobody runs this for somebody else, and a directory named for an audience with no reader is worse than no directory.

### The tool inventory

A hand-maintained tool inventory does not become a guide. Two reasons. It is reference rather than procedure, and `ki-guides` is explicit that a guide is not a second specification; and the existing inventory already demonstrates the drift failure — `README.md` claims thirty-two tools "all prefixed `gsuite_email_`" while `scripts/smoke.ts` asserts forty-two across email, calendar, Drive and Sheets. Promoting that list into `docs/guides/` would move a stale artefact into a governed collection and imply it was maintained.

The inventory therefore stays in `README.md`, where the reader can see it alongside the feature summary, and the guides link to it rather than restate it. The authoritative surface remains what the running server reports through `tools/list`, which is what the smoke test compares against.

The stale counts are corrected in passing, because the user guides have to tell a reader what the server can do and an inventory missing a quarter of the surface would make them wrong too. That is a bounded correction against `src/tools/` and `scripts/smoke.ts`, not an undertaking to maintain the list by hand. The durable answer is a `ki-specs` declaration owning the tool surface or generation from the tool declarations; neither is in this item's boundary, and the evidence is recorded here for whoever takes it up.
