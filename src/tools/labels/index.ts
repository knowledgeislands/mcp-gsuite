import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { createLabel, deleteLabel, listLabels, updateLabel } from '../../main/labels/index.js'
import { DESTRUCTIVE_REMOTE, READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE, WRITE_REMOTE } from '../../utils/annotations.js'
import { idSchema, shortTextSchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/labels handler returns via
// jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-kb-notion-mirror convention.

// gsuite_email_labels_list returns { labels: [{ id, name }] } — wrapped in an object
// (not a bare array) so structuredContent is a valid JSON object per the spec,
// consistent with the other list tools (messages/threads/drafts).
const listLabelsOutput = z.object({
  labels: z.array(z.object({ id: z.string(), name: z.string() }))
})

// create / update echo the persisted label.
const labelRefOutput = z.object({
  labelId: z.string(),
  name: z.string()
})

// dry-run preview vs the actual delete confirmation. Modelled as one object
// (not a union) so the SDK can normalise it to an object outputSchema; the
// dry-run-only `would_delete` field is optional.
const deleteLabelOutput = z.object({
  labelId: z.string(),
  dry_run: z.boolean(),
  deleted: z.boolean(),
  would_delete: z.object({ labelId: z.string(), name: z.string(), type: z.string() }).optional()
})

export const registerLabelTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_labels_list',
    {
      description: 'List all Gmail labels (system + user) with id and name. Returns `{labels: [{id, name}]}`.',
      inputSchema: z.object({}).strict(),
      outputSchema: listLabelsOutput,
      annotations: READ_ONLY_REMOTE
    },
    () => listLabels(cfg)
  )

  server.registerTool(
    'gsuite_email_label_create',
    {
      description: 'Create a new user label.',
      inputSchema: z
        .object({
          name: shortTextSchema.min(1).describe('Label name (e.g. "Archive/2026")')
        })
        .strict(),
      outputSchema: labelRefOutput,
      annotations: WRITE_REMOTE
    },
    (args) => createLabel(cfg, args)
  )

  server.registerTool(
    'gsuite_email_label_update',
    {
      description:
        'Rename a user label. Returns the updated `{labelId, name}`. System labels (INBOX, SENT, etc.) cannot be renamed and the API will reject the request.',
      inputSchema: z
        .object({
          labelId: idSchema.describe('Label id (from `gsuite_email_labels_list`).'),
          name: shortTextSchema.min(1).describe('New label name.')
        })
        .strict(),
      outputSchema: labelRefOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => updateLabel(cfg, args)
  )

  server.registerTool(
    'gsuite_email_label_delete',
    {
      description:
        "Delete a user label entirely. The label disappears from every message that had it (the messages themselves are untouched). System labels (INBOX, SENT, etc.) cannot be deleted. `dry_run` defaults to true — callers must pass `dry_run: false` to actually delete; dry-run fetches the label and returns its name and type in `would_delete` without calling Gmail's delete API.",
      inputSchema: z
        .object({
          labelId: idSchema.describe('Label id (from `gsuite_email_labels_list`).'),
          dry_run: z.boolean().default(true).describe('Preview only; do not delete. Default true — pass false to actually delete.')
        })
        .strict(),
      outputSchema: deleteLabelOutput,
      annotations: DESTRUCTIVE_REMOTE
    },
    (args) => deleteLabel(cfg, args)
  )
}
