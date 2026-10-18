---
id: KI-MCP-GSUITE-TOOL-009
area: TOOL
title: Add Gmail routing report-mode
kind: deliver
horizon: soon
status: draft
blocks: []
blocked_by: [KI-MCP-GSUITE-TOOL-008]
baseline_ref: null
created_at: 2026-10-18T00:25:46Z
updated_at: 2026-10-18T00:53:18Z
---

## Goal

The owner can lint a Gmail rule note against the live label list and see, without any mailbox change, where the shared routing rules would file each Inbox message.

## Context

The [Gmail routing design](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/email-routing/2026-10-17-gmail-routing-design.md) phase 1, task 5: a Gmail adapter behind the routing core's provider port, with `gsuite_email_routing_lint` and `gsuite_email_routing_triage` in report mode only. Its mapping makes folders **routing labels** held one at a time per message under a configured routing root; a move adds the destination label and removes `INBOX` and every other routing label; categories become labels under a reserved tag prefix; threads, archive, trash, star and unread map directly. `status:complete` is unsupported on Gmail and lints as `unsupported-on-provider`. A message carrying two routing labels lints as `ambiguous-location` and is left alone. Labels outside the routing roots and tag prefix are never added or removed.

The owner decided on 18 October 2026:

- **GMAIL-ACCOUNT:** start with the personal Google Workspace mailbox this server's existing registration already reaches, its address confirmed by `gsuite_auth_status`; no second account until live inbound routing (phase 2) passes.
- **NATIVE-FILTERS:** native Gmail filters keep running ahead of the engine, so the engine sees only what they leave in the Inbox. They are listed read-only in the rule note and each is decided at phase 4. The model is progressive enhancement: where a provider supports native filters, mechanical rules may later be pushed down to them and the engine adds contextual rules on top; where it does not, the engine runs them all. Compiling rules into filters is not part of this record.

## Boundary

Report mode only: no label change, trash, star or read-state write, and no `mode: apply`. Read the rule note fresh on each call from its configured path; this server never decides where that note lives. The configuration itself, routing roots, rules and tracking paths, is set in the machine configuration under separate work.

Both placement questions are answered (18 October 2026). The canonical engine stays in `mcp-m365` and arrives here vendored, as [KI-MCP-GSUITE-TOOL-008](KI-MCP-GSUITE-TOOL-008-consume-the-routing-core.md) delivers it (ENGINE-HOME). The first rule note replaces the inherited `Email Routing Rules` note in the personal knowledge base (PERSONAL-RULES). This record still never hard-codes that path: it reads whatever rules path the machine configuration sets.

## Shaping

- **Approach:** a label map (name to id), the single-routing-label invariant, Gmail search for listing, Sent and thread lookups, `text/calendar` `METHOD` detection into `calendarMethod`, and the two report-mode tools under the existing `read` access level.
- **Dependencies:** KI-MCP-GSUITE-TOOL-008; the routing configuration on the server; a rule note at the configured path.
- **Open decisions:** the tag prefix the categories block declares.
- **Promotion to Next:** TOOL-008 delivered and a rule note available to lint against.

## Discussion

### Exit test

The design's phase 1 exit test: lint is clean against the live label list, and several report-mode runs produce planned moves the owner agrees with, with no mailbox change made.

### Thread display

Gmail shows threads, so the report counts threads still in the Inbox as well as messages, keeping the owner's view and the engine's in agreement.

### Verification

Adapter fixture tests for the label invariant, `ambiguous-location`, `unsupported-on-provider` and calendar detection; a gated read-only run against the live mailbox.

### Intake authority

Captured on 18 October 2026 under the owner's CAPTURE-RECORDS answer, "Phases 0-1 only", with the GMAIL-ACCOUNT and NATIVE-FILTERS answers folded in. The horizon is the capturing agent's placement, not the owner's. Capture grants no priority, Ready transition, implementation, acceptance or publication authority.
