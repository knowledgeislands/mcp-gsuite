---
code: TOOL
---

# Tool surface roadmap

The service remains drafts-only: permanent deletion, Pub/Sub watch delivery, and direct send tools are deliberately out of scope unless a future policy decision changes that boundary. A single server process supports one Gmail account at a time.

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Add single-message label modification

Add `message_modify` as a convenience for combined add/remove labels on one message; retain batch modification as the more general operation.

### Add incremental Gmail history

Add `history_list({ startHistoryId, maxResults? })` using Gmail `users.history.list` to show changes without rescanning the inbox.

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

### Decide ASCII-table email guard rails

Choose whether HTML email bodies containing ASCII tables should be rejected with guidance, converted, or documented as-is.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.

### Review sending policy

Consider `message_send` or `draft_send` only through an explicit policy decision and opt-in environment flag, keeping drafts-only as the default.

### Add forward convenience

Add forwarding that inlines the original message and attachments.

### Evaluate MCP resources and Gmail settings tools

Evaluate resource exposure, filter management, and aliases/Send-As tools only if a client need justifies their additional surface area.
