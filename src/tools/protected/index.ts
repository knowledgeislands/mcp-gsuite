import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { listProtected } from '../../main/protected/index.js'
import { READ_ONLY_REMOTE } from '../../utils/annotations.js'

const protectedListOutput = z.object({
  enforced: z.boolean(),
  source: z.string().nullable(),
  error: z.string().optional(),
  entries: z.array(
    z.object({
      kind: z.literal('label'),
      id: z.string(),
      name: z.string(),
      current_name: z.string().nullable(),
      subtree: z.boolean(),
      reason: z.string().optional(),
      covers: z.array(z.object({ id: z.string(), name: z.string() }))
    })
  ),
  checked_at: z.string()
})

export const registerProtectedTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_email_protected_list',
    {
      description:
        "Report this account's protected list: the file it is read from (`MCP_GSUITE_PROTECTED_FILE`), whether the server enforces it, and each entry with the labels it covers now, resolved afresh by id on every call. While `enforced` is true, every tool that changes mail refuses a protected target with `PROTECTED_REFUSED`, all or nothing and with no override. `enforced` is false when there is no file or the file says `enforce = false` (writes behave as usual), or when the file is unusable, which carries `error` and blocks every guarded write until it is fixed.",
      inputSchema: z.object({}).strict(),
      outputSchema: protectedListOutput,
      annotations: READ_ONLY_REMOTE
    },
    () => listProtected(cfg)
  )
}
