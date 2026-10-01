import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { createFilter, deleteFilter, listFilters } from '../../main/filters/index.js'
import { DESTRUCTIVE_REMOTE, READ_ONLY_REMOTE, WRITE_REMOTE } from '../../utils/annotations.js'
import { idSchema, querySchema, shortTextSchema } from '../../utils/schemas.js'

const filterSchema = z
  .object({
    id: z.string().optional(),
    criteria: z.record(z.string(), z.unknown()).optional(),
    action: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough()

export const registerFilterTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_filters_list',
    {
      description: 'List existing Gmail filters, including their criteria and actions.',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ filters: z.array(filterSchema) }),
      annotations: READ_ONLY_REMOTE
    },
    () => listFilters(cfg)
  )

  server.registerTool(
    'gsuite_email_filter_create',
    {
      description:
        'Preview or create a future-mail Gmail filter. The same criteria cannot silently acquire conflicting actions. Does not apply to existing mail. No forwarding or automatic deletion.',
      inputSchema: z
        .object({
          criteria: z
            .object({
              from: shortTextSchema.optional(),
              to: shortTextSchema.optional(),
              subject: shortTextSchema.optional(),
              query: querySchema.optional(),
              negatedQuery: querySchema.optional()
            })
            .strict(),
          action: z
            .object({
              addLabelId: idSchema.optional(),
              skipInbox: z.boolean().default(false),
              markRead: z.boolean().default(false)
            })
            .strict(),
          dry_run: z.boolean().default(true)
        })
        .strict(),
      outputSchema: z.object({
        dry_run: z.boolean(),
        created: z.boolean(),
        existingFilterId: z.string().nullable(),
        filter: filterSchema
      }),
      annotations: WRITE_REMOTE
    },
    (args) => createFilter(cfg, args)
  )

  server.registerTool(
    'gsuite_email_filter_delete',
    {
      description: 'Preview or delete a Gmail filter. Defaults to preview; deleting affects future routing only.',
      inputSchema: z.object({ filterId: idSchema, dry_run: z.boolean().default(true) }).strict(),
      outputSchema: z.object({ dry_run: z.boolean(), deleted: z.boolean(), filter: filterSchema }),
      annotations: DESTRUCTIVE_REMOTE
    },
    (args) => deleteFilter(cfg, args)
  )
}
