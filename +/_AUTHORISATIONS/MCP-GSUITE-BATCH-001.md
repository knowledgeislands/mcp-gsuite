---
id: MCP-GSUITE-BATCH-001
repository: https://github.com/knowledgeislands/mcp-gsuite
approved: true
approved_at: 2026-09-07T21:07:30Z
authority_mode: outcome
authority_evidence: User approved the governed GOV-054 estate rollout and instructed immediate execution under the committed Harness worker packet at 2179f1d2.
approved_payload_sha256: 71b725e80b7ac1f8ce1b0cc577d8e6c481c4d584c0027a486dfa1d39fc742155
run_id: MCP-GSUITE-BATCH-001-RUN-001
timebox_ends_at: 2026-09-08T00:07:30Z
item_ids: [MCP-GSUITE-FND-005]
completion_target: awaiting-review
mandatory_stops:
  - material-scope-expansion
  - destructive-or-irreversible-work
  - external-coordination
  - verification-failure
  - public-command-name-change
  - push-or-release
---

# MCP-GSUITE-BATCH-001 — Remove obsolete MCP exclusions

## Outcome authority

Deliver `MCP-GSUITE-FND-005` through its verified local implementation boundary and stop at `awaiting-review`. Keep package-script changes, external systems, closure, pruning, pushing, and release outside the run.

## Selected plan

1. `MCP-GSUITE-FND-005` — remove the exact four now-obsolete `ki-repo-mcp` script exclusions while preserving every command and all runtime behaviour.

## Scope

Mutable paths are limited to `.ki.toml`, `docs/roadmap/_ISSUES.md`, `docs/roadmap/MCP-GSUITE-FND-005-remove-obsolete-mcp-script-exclusions.md`, and `+/_AUTHORISATIONS/MCP-GSUITE-BATCH-001.md` in this repository.

## Required verification

- Focused `ki-engineering`, `ki-repo-mcp`, and `ki-work-roadmap` audits.
- `bunx tsc --noEmit` and `bun run test`.
- TOML parsing, package-script equality, and `git diff --check`.

## Allowed decisions and delegation

Remove only the four locked exclusions after central claim commit `de881b6d`. Package command names and bodies are locked. No runtime delegation is authorised; the coordinator executes the bounded change serially.

## Completion and remedial policy

The item stops at `awaiting-review` with the canonical six-heading review packet. This authorisation grants no closure or pruning authority. A failed required gate, external need, or wider change stops the run; non-blocking unrelated drift becomes separately reviewed work.

## Run ledger

<!-- ki-batch-run: MCP-GSUITE-BATCH-001-RUN-001 71b725e80b7ac1f8ce1b0cc577d8e6c481c4d584c0027a486dfa1d39fc742155 -->

## Run outcome

- `MCP-GSUITE-FND-005` began Ready at immutable baseline `c4332340f0f3ae69ed4e99abade9da2fee746cf2` and reached `awaiting-review` after implementation commit `8aa3596f7195015e59bc0ff30d924b57987a0294`.
- Focused `ki-engineering`, `ki-repo-mcp`, and roadmap audits passed; TypeScript passed; 21 test files and 466 tests passed; TOML parsing, package-script equality, Markdown, and diff checks passed.
- No decision beyond the locked four-exclusion removal was taken, no delegation was used, and no external command, push, release, closure, or prune occurred.
- Next action is human review through `ki-accept`; this authorisation grants no closure authority.
