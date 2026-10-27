---
id: KI-MCP-GSUITE-TOOL-009
area: TOOL
title: Add Gmail routing report-mode
kind: deliver
horizon: hold
hold:
  reason: waiting-for
  condition: until Kris resumes Humans not Robots work, when hnr.email-routing chooses a horizon afresh (EMAIL-OWNER, Kris, 20 October)
status: draft
blocks: []
blocked_by: [KI-MCP-GSUITE-TOOL-008]
baseline_ref: null
created_at: 2026-10-18T00:25:46Z
updated_at: 2026-10-19T23:24:19Z
---

> **Idea, not on the roadmap.** Let the owner lint a Gmail rule note against the live labels and see where the shared rules would file each Inbox message without changing the mailbox; follows consuming the routing core. Moved out of `docs/roadmap/` on 27 October 2026 under the roadmap sweep, with its record kept in full here so that it can return when Kris brings it back; it was `KI-MCP-GSUITE-TOOL-009`.

## Goal

The owner can lint a Gmail rule note against the live label list and see, without any mailbox change, where the shared routing rules would file each Inbox message.

## Context

The [Gmail routing design](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_WORK/hnr.email-routing/design/2026-10-17-gmail-routing-design.md) phase 1, task 5: a Gmail adapter behind the routing core's provider port, with `gsuite_email_routing_lint` and `gsuite_email_routing_triage` in report mode only. Its mapping makes folders **routing labels** held one at a time per message under a configured routing root; a move adds the destination label and removes `INBOX` and every other routing label; categories become labels under a reserved tag prefix; threads, archive, trash, star and unread map directly. `status:complete` is unsupported on Gmail and lints as `unsupported-on-provider`. A message carrying two routing labels lints as `ambiguous-location` and is left alone. Labels outside the routing roots and tag prefix are never added or removed.

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

## Hold

Held until a Project opens to own email routing (LANE-OWNERS, Kris, 19 October). Kris answered LANE-OWNERS a) on 19 October 2026: the email-routing draft records in mcp-m365 and mcp-gsuite wait in one hold until a Project opens to own them. The record was at `horizon: soon` before the hold; release chooses a horizon afresh once that Project exists.

Re-validated on 20 October 2026 under TO-DONE: the hold stays. Kris answered EMAIL-OWNER on 20 October ("if that's all to do with H and R, it can go to the H and R area"), so the Project the condition waited for exists, [hnr.email-routing](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_WORK/hnr.email-routing/work.md), and owns these records; that Project is itself paused until Kris resumes Humans not Robots work, which is now the release condition.

## Discussion

### Exit test

The design's phase 1 exit test: lint is clean against the live label list, and several report-mode runs produce planned moves the owner agrees with, with no mailbox change made.

### Thread display

Gmail shows threads, so the report counts threads still in the Inbox as well as messages, keeping the owner's view and the engine's in agreement.

### Verification

Adapter fixture tests for the label invariant, `ambiguous-location`, `unsupported-on-provider` and calendar detection; a gated read-only run against the live mailbox.

### Intake authority

Captured on 18 October 2026 under the owner's CAPTURE-RECORDS answer, "Phases 0-1 only", with the GMAIL-ACCOUNT and NATIVE-FILTERS answers folded in. The horizon is the capturing agent's placement, not the owner's. Capture grants no priority, Ready transition, implementation, acceptance or publication authority.
