import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { getAttachment, getAttachmentMetadata } from '../../main/attachments/index.js'
import { READ_ONLY_REMOTE } from '../../utils/annotations.js'
import { attachmentIdSchema, idSchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/attachments handler returns
// via jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-kb-notion-mirror convention.

// gsuite_email_attachment_get has two return shapes depending on `outputPath`:
//   with outputPath → { messageId, path, sizeBytes }   (bytes written to disk)
//   without         → { filename, mimeType, data }      (base64url inline)
// Modelled as one object (not a union) with both branches' fields optional so
// the SDK can normalise it to an object outputSchema.
const getAttachmentOutput = z.object({
  messageId: z.string().optional(),
  path: z.string().optional(),
  sizeBytes: z.number().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  data: z.string().optional()
})

const attachmentMetadataOutput = z.object({
  messageId: z.string(),
  attachmentId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number()
})

export const registerAttachmentTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_attachment_get',
    {
      description:
        'Download an attachment by id. With `outputPath`, writes the decoded bytes to that file and returns {messageId, path, sizeBytes} (filename/mimeType come from `gsuite_email_message_get` — they are not duplicated here). Without it, returns {filename, mimeType, data} where `data` is base64url as returned by Gmail; capped at `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES` (default 256 KiB decoded) — attachments above the cap return an error directing the caller to use `outputPath`. `outputPath` is validated against `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) — targets outside that root are rejected.',
      inputSchema: z
        .object({
          messageId: idSchema,
          attachmentId: attachmentIdSchema,
          outputPath: z
            .string()
            .min(1)
            .max(4096)
            .optional()
            .describe(
              'Optional file path to write the decoded bytes to. Must live inside MCP_GSUITE_DOWNLOAD_PATH. If provided, the response omits `data` and returns size metadata instead — useful for large attachments that would overflow the response.'
            )
        })
        .strict(),
      outputSchema: getAttachmentOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getAttachment(cfg, args)
  )

  server.registerTool(
    'gsuite_email_attachment_metadata',
    {
      description:
        "Get an attachment's filename, MIME type, and size without downloading the bytes. Fetches the parent message's part tree via `messages.get(format=full)` and looks up the part by attachmentId — useful when deciding whether to download a large attachment.",
      inputSchema: z
        .object({
          messageId: idSchema,
          attachmentId: attachmentIdSchema
        })
        .strict(),
      outputSchema: attachmentMetadataOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getAttachmentMetadata(cfg, args)
  )
}
