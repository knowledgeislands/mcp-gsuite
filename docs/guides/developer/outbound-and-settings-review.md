# Outbound and Gmail settings review

## Sending policy review

The supported outbound workflow composes a draft, then the user reviews it in Gmail and sends it there. Existing reply/reply-all and forwarding conveniences support that workflow. No recorded client requirement establishes that this human review step is inadequate. The current tool surface and smoke invariant deliberately exclude sending at every tier; Google OAuth scopes permitting send do not grant agent permission to send.

Retain the existing draft-only policy. A message-send endpoint would remove the review boundary; a draft-send endpoint could send stale or independently edited content. A boolean opt-in alone does not address recipient/content confirmation, duplicate sends after ambiguous provider failures, audit evidence, or recovery. Neither is justified by the current workflow evidence. This review grants no new sending authority.

Reopen only for a concrete unmet client workflow and an explicit owner-approved sending contract: opt-in deployment gate, per-call recipient/content confirmation, immutable draft/content identity, ambiguous-retry policy, audit/redaction expectations, and fixture plus authorised live verification. Preserve draft-only defaults until that decision exists.

## Resources and Gmail settings evaluation

Existing Gmail filters already provide list, preview/create, and preview/delete. Creation has safe bounded criteria/actions and excludes forwarding and automatic deletion; deletion defaults to preview. Registration tests and smoke inventory cover those tools. Reimplementing filters adds no missing capability.

Existing search/get/list tools already provide message, thread, attachment and draft discovery to clients. MCP resources could expose stable discoverable identifiers, but no recorded client workflow requires a resource route or subscription that these tools cannot serve. Resource cache freshness, mailbox authorization, attachment-size bounds and tenant identity would add contracts without a demonstrated benefit. Keep the current tool surface and reconsider resources only with a named client capability and unmet outcome.

Aliases/Send-As listing might help choose a sender, but existing drafts do not expose a sender selector. Mutating Send-As settings, alias verification, signatures or forwarding would expand account policy and potentially OAuth permissions. No recorded client workflow justifies that expansion. Do not add alias or Send-As tools now. Reopen with a concrete sender-selection workflow, least-privilege scope analysis, identity-validation rules and an explicitly approved draft-only first slice.

These are conclusions from repository source, registration fixtures and documented workflows; no live client session, account setting or provider integration was observed. Absence of an evidenced need supports preserving the current surface, not a claim that no future client could benefit.
