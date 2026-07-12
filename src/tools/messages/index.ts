import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import {
  getMessage,
  getRawMessage,
  labelMessage,
  messageArchive,
  messageBatchModify,
  messageMarkRead,
  messageMarkUnread,
  messageTrash,
  searchMessages,
  unlabelMessage
} from '../../main/messages/index.js'
import { READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE } from '../../utils/annotations.js'
import { idSchema, querySchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/messages handler returns via
// jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-ki-kb-notion-mirror convention.

// A row in gsuite_email_messages_search results (format=metadata projection).
const messageSummaryRow = z.object({
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: z.string(),
  date: z.string(),
  snippet: z.string(),
  labelIds: z.array(z.string()),
  hasAttachments: z.boolean()
})

// An attachment reference as returned by extractAttachments.
const attachmentRef = z.object({
  attachmentId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number()
})

const searchOutput = z.object({
  messages: z.array(messageSummaryRow),
  nextPageToken: z.string().optional()
})

const getMessageOutput = z.object({
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  cc: z.string(),
  date: z.string(),
  body: z.string(),
  labelIds: z.array(z.string()),
  attachments: z.array(attachmentRef)
})

const rawMessageOutput = z.object({
  messageId: z.string(),
  path: z.string(),
  sizeBytes: z.number()
})

// label / unlabel / mark_read / mark_unread / archive / trash all echo this.
const messageLabelStateOutput = z.object({
  messageId: z.string(),
  labelIds: z.array(z.string())
})

const batchModifyOutput = z.object({
  count: z.number(),
  messageIds: z.array(z.string()),
  addLabelIds: z.array(z.string()),
  removeLabelIds: z.array(z.string())
})

export const registerMessageTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_messages_search',
    {
      description:
        'Search messages with a Gmail query string (same syntax as the Gmail search box). Returns `{messages, nextPageToken?}`; pass `nextPageToken` back as `pageToken` to fetch the next page. The token is omitted when there are no more results. To filter by a label whose name contains spaces, either pass its exact id(s) via `labelIds` (most reliable) or quote the name in the query (`label:"Matters/Criminal - False Allegations"`) — the server rewrites quoted names to the hyphenated form Gmail expects. An unquoted `label:` with spaces silently matches nothing.',
      inputSchema: z
        .object({
          query: querySchema.describe('Gmail query, e.g. `from:foo@bar.com has:attachment newer_than:7d`'),
          maxResults: z
            .number()
            .int()
            .positive()
            .max(500)
            .optional()
            .describe(`Max results per page (default ${cfg.defaultSearchResults}).`),
          pageToken: z
            .string()
            .min(1)
            .max(4096)
            .optional()
            .describe('Continuation token from a previous `gsuite_email_messages_search` call.'),
          labelIds: z
            .array(idSchema)
            .min(1)
            .optional()
            .describe(
              'Exact label ids (from `gsuite_email_labels_list`) the message must carry. Reliable for any label name, including those with spaces or slashes; ANDed with `query`.'
            )
        })
        .strict(),
      outputSchema: searchOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => searchMessages(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_get',
    {
      description:
        'Get a message. `format` defaults to `full` (headers + plain-text body + attachment refs); `metadata` returns headers + label ids only, with empty `body` and `attachments` — cheaper when the caller only needs envelope data.',
      inputSchema: z
        .object({
          messageId: idSchema,
          format: z
            .enum(['metadata', 'full'])
            .optional()
            .describe(
              '`full` (default): full body + attachment refs. `metadata`: headers + labels only; `body` and `attachments` are empty.'
            )
        })
        .strict(),
      outputSchema: getMessageOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getMessage(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_raw',
    {
      description:
        'Fetch the raw RFC 2822 message and write it to `outputPath` (suitable for saving as `.eml`). Returns {messageId, path, sizeBytes} — the message body never travels through the response, so this is safe for messages with large attachments. Subject and date are NOT returned (they live inside the raw bytes; use `gsuite_email_message_get` for headers). `outputPath` is validated against `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) — targets outside that root are rejected.',
      inputSchema: z
        .object({
          messageId: idSchema,
          outputPath: z
            .string()
            .min(1)
            .max(4096)
            .describe(
              'Filesystem path where the decoded RFC 2822 message will be written. Must live inside MCP_GSUITE_DOWNLOAD_PATH. Parent directories are created if missing.'
            )
        })
        .strict(),
      outputSchema: rawMessageOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getRawMessage(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_label',
    {
      description: 'Add one or more labels to a message.',
      inputSchema: z
        .object({
          messageId: idSchema,
          labelIds: z.array(idSchema).min(1)
        })
        .strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => labelMessage(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_unlabel',
    {
      description: 'Remove one or more labels from a message.',
      inputSchema: z
        .object({
          messageId: idSchema,
          labelIds: z.array(idSchema).min(1)
        })
        .strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => unlabelMessage(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_mark_read',
    {
      description:
        'Mark a message as read (remove the `UNREAD` system label). Sugar over `gsuite_email_message_unlabel({ labelIds: ["UNREAD"] })` so callers don\'t need to know the magic id.',
      inputSchema: z.object({ messageId: idSchema }).strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => messageMarkRead(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_mark_unread',
    {
      description: 'Mark a message as unread (add the `UNREAD` system label).',
      inputSchema: z.object({ messageId: idSchema }).strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => messageMarkUnread(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_archive',
    {
      description: 'Archive a message (remove the `INBOX` system label). The message remains searchable; it just leaves the inbox view.',
      inputSchema: z.object({ messageId: idSchema }).strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => messageArchive(cfg, args)
  )

  server.registerTool(
    'gsuite_email_message_trash',
    {
      description:
        "Move a message to Trash via `messages.trash`. Recoverable for ~30 days from Gmail's Trash UI; distinct from permanent deletion (which this server does not expose).",
      inputSchema: z.object({ messageId: idSchema }).strict(),
      outputSchema: messageLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => messageTrash(cfg, args)
  )

  server.registerTool(
    'gsuite_email_messages_batch_modify',
    {
      description:
        'Add and/or remove labels on up to 1000 messages in a single Gmail `messages.batchModify` call. At least one of `addLabelIds` or `removeLabelIds` is required. Returns `{count, messageIds, addLabelIds, removeLabelIds}` echoing the operation (Gmail returns 204 No Content on success).',
      inputSchema: z
        .object({
          messageIds: z.array(idSchema).min(1).max(1000).describe('Up to 1000 message ids in a single call (Gmail API limit).'),
          addLabelIds: z.array(idSchema).optional(),
          removeLabelIds: z.array(idSchema).optional()
        })
        .strict(),
      outputSchema: batchModifyOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => messageBatchModify(cfg, args)
  )
}
