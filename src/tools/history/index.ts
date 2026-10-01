import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { historyCheckpoint, historyList, historyResponseSchema } from '../../main/history/index.js'
import { READ_ONLY_REMOTE } from '../../utils/annotations.js'

export const registerHistoryTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_history_checkpoint',
    {
      description:
        'Read the mailbox historyId before an initial full search. Keep this exact decimal string as a caller-owned checkpoint, then replay history after the search.',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ historyId: z.string().regex(/^\d+$/) }).strict(),
      annotations: READ_ONLY_REMOTE
    },
    () => historyCheckpoint(cfg)
  )

  server.registerTool(
    'gsuite_email_history_list',
    {
      description:
        'List typed Gmail changes after startHistoryId. Drain nextPageToken pages before saving the final mailbox historyId; a 404 requires a new checkpoint and full search.',
      inputSchema: z
        .object({
          startHistoryId: z
            .string()
            .regex(/^\d+$/)
            .describe('Exact decimal mailbox history ID from a checkpoint or prior completed list'),
          maxResults: z.number().int().min(1).max(500).optional().describe('History records per page, at most 500'),
          pageToken: z
            .string()
            .min(1)
            .max(2048)
            .optional()
            .describe('Continuation token returned by a prior history page')
        })
        .strict(),
      outputSchema: historyResponseSchema,
      annotations: READ_ONLY_REMOTE
    },
    (args) => historyList(cfg, args)
  )
}
