# Outbound and Gmail settings review

## Sending policy review

The supported outbound workflow composes a draft, then the user reviews it in Gmail and sends it there. Existing reply/reply-all and forwarding conveniences support that workflow. No recorded client requirement establishes that this human review step is inadequate. The current tool surface and smoke invariant deliberately exclude sending at every tier; Google OAuth scopes permitting send do not grant agent permission to send.

Retain the existing draft-only policy. A message-send endpoint would remove the review boundary; a draft-send endpoint could send stale or independently edited content. A boolean opt-in alone does not address recipient/content confirmation, duplicate sends after ambiguous provider failures, audit evidence, or recovery. Neither is justified by the current workflow evidence. This review grants no new sending authority.

Reopen only for a concrete unmet client workflow and an explicit owner-approved sending contract: opt-in deployment gate, per-call recipient/content confirmation, immutable draft/content identity, ambiguous-retry policy, audit/redaction expectations, and fixture plus authorised live verification. Preserve draft-only defaults until that decision exists.
