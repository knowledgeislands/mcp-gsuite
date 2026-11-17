import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { getAttachment, getAttachmentMetadata, saveAttachment } from '../../main/attachments/index.js'
import { READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE } from '../../utils/annotations.js'
import { attachmentIdSchema, idSchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/attachments handler returns
// via jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-ki-kb-notion-mirror convention.

const getAttachmentOutput = z.object({
  filename: z.string(),
  mimeType: z.string(),
  data: z.string()
})

const saveAttachmentOutput = z.object({
  messageId: z.string(),
  path: z.string(),
  sizeBytes: z.number()
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
        'Download an attachment by id and return {filename, mimeType, data} inline, where `data` is base64url as returned by Gmail. Capped at `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES` (default 256 KiB decoded); attachments above the cap return an error directing the caller to `gsuite_email_attachment_save`, which writes to disk.',
      inputSchema: z
        .object({
          messageId: idSchema,
          attachmentId: attachmentIdSchema
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

  server.registerTool(
    'gsuite_email_attachment_save',
    {
      description:
        'Download an attachment by id and write the decoded bytes to a new file at `outputPath`. Returns {messageId, path, sizeBytes} (filename/mimeType come from `gsuite_email_message_get` — they are not duplicated here); the bytes never travel through the response, so this suits large attachments. `outputPath` is validated against `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) — targets outside that root are rejected. Never overwrites: an existing file at `outputPath` is an error. Registered at the `write` access level, since it writes to the local file system.',
      inputSchema: z
        .object({
          messageId: idSchema,
          attachmentId: attachmentIdSchema,
          outputPath: z
            .string()
            .min(1)
            .max(4096)
            .describe(
              'Filesystem path to write the decoded bytes to. Must live inside MCP_GSUITE_DOWNLOAD_PATH and must not already exist. Parent directories are created if missing.'
            )
        })
        .strict(),
      outputSchema: saveAttachmentOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => saveAttachment(cfg, args)
  )
}
