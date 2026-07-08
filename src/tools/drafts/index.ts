import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../../main/drafts/index.js'
import { DESTRUCTIVE_REMOTE, READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE, WRITE_REMOTE } from '../../utils/annotations.js'
import { bodyTextSchema, idSchema, querySchema, shortTextSchema } from '../../utils/schemas.js'

// `to` is optional at the schema level so callers can use `replyAll` to
// auto-populate it from the original message. The handler still requires
// at least one recipient when `replyAll` is not set. Each recipient is an
// RFC 5321 address (or "Name <addr>"), length-capped per §6.9.
const optionalRecipientField = z.array(z.string().min(1).max(998)).optional()

// An attachment is a host filesystem path, or {path, filename?, mimeType?}.
const attachmentField = z
  .array(
    z.union([
      z.string().min(1).max(4096),
      z.object({
        path: z.string().min(1).max(4096),
        filename: shortTextSchema.min(1).optional(),
        mimeType: z.string().min(1).max(255).optional()
      })
    ])
  )
  .optional()

// ── output schemas ──
// Each mirrors the exact shape the matching main/drafts handler returns via
// jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-kb-notion-mirror convention.

// An attachment reference as returned by extractAttachments.
const attachmentRef = z.object({
  attachmentId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number()
})

// create / update echo the persisted draft's ids.
const draftRefOutput = z.object({
  draftId: z.string(),
  messageId: z.string(),
  threadId: z.string()
})

// A row in gsuite_email_drafts_list results (format=metadata projection).
const draftSummaryRow = z.object({
  draftId: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  to: z.string(),
  cc: z.string(),
  date: z.string(),
  snippet: z.string()
})

const listDraftsOutput = z.object({
  drafts: z.array(draftSummaryRow),
  nextPageToken: z.string().optional()
})

const getDraftOutput = z.object({
  draftId: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  to: z.string(),
  cc: z.string(),
  bcc: z.string(),
  date: z.string(),
  body: z.string(),
  labelIds: z.array(z.string()),
  attachments: z.array(attachmentRef)
})

// dry-run preview vs the actual delete confirmation. Modelled as one object
// (not a union) so the SDK can normalise it to an object outputSchema; the
// dry-run-only `would_delete` field is optional.
const deleteDraftOutput = z.object({
  draftId: z.string(),
  dry_run: z.boolean(),
  deleted: z.boolean(),
  would_delete: z.object({ draftId: z.string(), subject: z.string() }).optional()
})

export const registerDraftTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_draft_create',
    {
      description:
        'Create a draft email in the user\'s Drafts folder. Does NOT send — the user reviews and sends from Gmail. With `replyToMessageId`, the draft inherits the original\'s threadId, In-Reply-To and References headers, and a "Re:" subject (unless overridden). With `replyAll: true` (requires `replyToMessageId`), `to` and `cc` auto-populate from the original (deduped against the authenticated account); the caller can still override either by supplying them. At least one of `bodyText` / `bodyHtml` is required; supplying both emits `multipart/alternative` so plain-text fallback survives. Attachments are file paths on the MCP server host; mimeType is inferred from the extension.',
      inputSchema: z
        .object({
          to: optionalRecipientField.describe('Required unless `replyAll` is true. Each entry can be "addr@host" or "Name <addr@host>".'),
          cc: optionalRecipientField,
          bcc: optionalRecipientField,
          subject: shortTextSchema.optional().describe('If omitted and `replyToMessageId` is set, defaults to "Re: <original subject>".'),
          bodyText: bodyTextSchema
            .optional()
            .describe('Plain-text body. Line endings are normalised to CRLF. Optional if `bodyHtml` is provided.'),
          bodyHtml: bodyTextSchema
            .optional()
            .describe(
              'HTML body. When provided alongside `bodyText`, the message is emitted as `multipart/alternative` (text/plain + text/html) so plain-text clients still render.'
            ),
          attachments: attachmentField.describe(
            'Each entry is either a filesystem path (filename = basename, mimeType inferred from extension) or `{path, filename?, mimeType?}` to override either field.'
          ),
          replyToMessageId: idSchema.optional().describe('Gmail messageId of a message to reply to. Threads the draft and copies headers.'),
          replyAll: z
            .boolean()
            .optional()
            .describe(
              'Requires `replyToMessageId`. Auto-populates `to` (= original From + To) and `cc` (= original Cc), excluding the authenticated account. Caller-supplied `to` / `cc` win.'
            )
        })
        .strict(),
      outputSchema: draftRefOutput,
      annotations: WRITE_REMOTE
    },
    (args) => createDraft(cfg, args)
  )

  server.registerTool(
    'gsuite_email_draft_update',
    {
      description: 'Replace an existing draft entirely. Same shape as `gsuite_email_draft_create` plus `draftId`.',
      inputSchema: z
        .object({
          draftId: idSchema,
          to: optionalRecipientField,
          cc: optionalRecipientField,
          bcc: optionalRecipientField,
          subject: shortTextSchema.optional(),
          bodyText: bodyTextSchema.optional(),
          bodyHtml: bodyTextSchema.optional(),
          attachments: attachmentField,
          replyToMessageId: idSchema.optional(),
          replyAll: z.boolean().optional()
        })
        .strict(),
      outputSchema: draftRefOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => updateDraft(cfg, args)
  )

  server.registerTool(
    'gsuite_email_drafts_list',
    {
      description: 'List drafts (optionally filtered by a Gmail query). Returns `{drafts, nextPageToken?}`.',
      inputSchema: z
        .object({
          query: querySchema.min(1).optional().describe('Optional Gmail-query filter, e.g. `to:foo@bar.com`.'),
          maxResults: z.number().int().positive().max(500).optional(),
          pageToken: z.string().min(1).max(4096).optional()
        })
        .strict(),
      outputSchema: listDraftsOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => listDrafts(cfg, args)
  )

  server.registerTool(
    'gsuite_email_draft_get',
    {
      description: "Get a draft's full body, headers, label ids, and attachment refs.",
      inputSchema: z.object({ draftId: idSchema }).strict(),
      outputSchema: getDraftOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getDraft(cfg, args)
  )

  server.registerTool(
    'gsuite_email_draft_delete',
    {
      description:
        "Permanently delete a draft. Idempotent on the outcome (already-deleted drafts return 404 from Gmail). `dry_run` defaults to true — callers must pass `dry_run: false` to actually delete; dry-run fetches the draft and returns its subject in `would_delete` without calling Gmail's delete API.",
      inputSchema: z
        .object({
          draftId: idSchema,
          dry_run: z.boolean().default(true).describe('Preview only; do not delete. Default true — pass false to actually delete.')
        })
        .strict(),
      outputSchema: deleteDraftOutput,
      annotations: DESTRUCTIVE_REMOTE
    },
    (args) => deleteDraft(cfg, args)
  )
}
