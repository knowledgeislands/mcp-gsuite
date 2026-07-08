import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import {
  getThread,
  labelThread,
  searchThreads,
  threadArchive,
  threadMarkRead,
  threadMarkUnread,
  threadTrash,
  unlabelThread
} from '../../main/threads/index.js'
import { READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE } from '../../utils/annotations.js'
import { idSchema, querySchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/threads handler returns via
// jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring
// layer, matching the sibling mcp-kb-notion-mirror convention.

// A row in gsuite_email_threads_search results.
const threadSummaryRow = z.object({
  threadId: z.string(),
  snippet: z.string(),
  messageCount: z.number(),
  latestSubject: z.string(),
  latestFrom: z.string(),
  latestDate: z.string(),
  labelIds: z.array(z.string())
})

// An attachment reference as returned by extractAttachments.
const attachmentRef = z.object({
  attachmentId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number()
})

// A full message within a thread (gsuite_email_thread_get).
const threadMessageRow = z.object({
  messageId: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  cc: z.string(),
  date: z.string(),
  body: z.string(),
  labelIds: z.array(z.string()),
  hasAttachments: z.boolean(),
  attachments: z.array(attachmentRef)
})

const searchThreadsOutput = z.object({
  threads: z.array(threadSummaryRow),
  nextPageToken: z.string().optional()
})

const getThreadOutput = z.object({
  threadId: z.string(),
  messageCount: z.number(),
  messages: z.array(threadMessageRow)
})

// label / unlabel / mark_read / mark_unread / archive / trash all echo this.
const threadLabelStateOutput = z.object({
  threadId: z.string(),
  labelIds: z.array(z.string())
})

export const registerThreadTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_threads_search',
    {
      description:
        'Search threads with a Gmail query string (same syntax as `gsuite_email_messages_search`). Returns `{threads, nextPageToken?}` where each thread carries id, snippet, messageCount, latest-message headers, and the union of label ids across all messages. To filter by a label whose name contains spaces, either pass its exact id(s) via `labelIds` (most reliable) or quote the name in the query (`label:"Matters/Criminal - False Allegations"`) — the server rewrites quoted names to the hyphenated form Gmail expects. An unquoted `label:` with spaces silently matches nothing.',
      inputSchema: z
        .object({
          query: querySchema.describe('Gmail query, e.g. `from:foo@bar.com newer_than:30d`'),
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
            .describe('Continuation token from a previous `gsuite_email_threads_search` call.'),
          labelIds: z
            .array(idSchema)
            .min(1)
            .optional()
            .describe(
              'Exact label ids (from `gsuite_email_labels_list`) a message in the thread must carry. Reliable for any label name, including those with spaces or slashes; ANDed with `query`.'
            )
        })
        .strict(),
      outputSchema: searchThreadsOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => searchThreads(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_get',
    {
      description: 'Get every message in a thread, each with headers, plain-text body (HTML stripped), label ids, and attachment refs.',
      inputSchema: z
        .object({
          threadId: idSchema
        })
        .strict(),
      outputSchema: getThreadOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getThread(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_label',
    {
      description: 'Add one or more labels to every message in a thread (Gmail propagates the change automatically).',
      inputSchema: z
        .object({
          threadId: idSchema,
          labelIds: z.array(idSchema).min(1)
        })
        .strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => labelThread(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_unlabel',
    {
      description: 'Remove one or more labels from every message in a thread.',
      inputSchema: z
        .object({
          threadId: idSchema,
          labelIds: z.array(idSchema).min(1)
        })
        .strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => unlabelThread(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_mark_read',
    {
      description: 'Mark every message in a thread as read (remove the `UNREAD` system label).',
      inputSchema: z.object({ threadId: idSchema }).strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => threadMarkRead(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_mark_unread',
    {
      description: 'Mark every message in a thread as unread (add the `UNREAD` system label).',
      inputSchema: z.object({ threadId: idSchema }).strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => threadMarkUnread(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_archive',
    {
      description: 'Archive an entire thread (remove the `INBOX` system label from every message). The thread remains searchable.',
      inputSchema: z.object({ threadId: idSchema }).strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => threadArchive(cfg, args)
  )

  server.registerTool(
    'gsuite_email_thread_trash',
    {
      description:
        "Move every message in a thread to Trash via `threads.trash`. Recoverable for ~30 days from Gmail's Trash UI; permanent deletion is intentionally not exposed.",
      inputSchema: z.object({ threadId: idSchema }).strict(),
      outputSchema: threadLabelStateOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => threadTrash(cfg, args)
  )
}
