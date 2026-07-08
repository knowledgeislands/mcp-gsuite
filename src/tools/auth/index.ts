import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { about, authenticate, authStatus } from '../../main/auth-info/index.js'
import { READ_ONLY, WRITE_REMOTE } from '../../utils/annotations.js'

// ── output schemas ──
// gsuite_about and gsuite_auth_status return jsonResult; their schemas mirror the
// exact shape so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). gsuite_auth_start returns a text-only result (a URL
// to open in a browser), so it deliberately has no outputSchema.

const aboutOutput = z.object({
  name: z.string(),
  version: z.string(),
  scopes: z.array(z.string()),
  tokenStorePath: z.string(),
  authServerUrl: z.string()
})

// Mirrors TokenSummary from main/auth — redacted token metadata only.
const authStatusOutput = z.object({
  authenticated: z.boolean(),
  hasRefreshToken: z.boolean(),
  scope: z.array(z.string()),
  expiresAt: z.number().nullable(),
  tokenStorePath: z.string()
})

export const registerAuthTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_about',
    {
      description: 'Returns information about this mcp-gsuite server (version, scopes, token store path).',
      inputSchema: z.object({}).strict(),
      outputSchema: aboutOutput,
      annotations: READ_ONLY
    },
    () => about(cfg)
  )

  server.registerTool(
    'gsuite_auth_start',
    {
      description:
        'Start the Google OAuth flow. Returns a URL to visit in a browser; on consent the auth server (`mcp-gsuite-auth`, which must be running on the configured port) persists tokens to disk — registered under the `write` role because of that token-store mutation.',
      inputSchema: z.object({}).strict(),
      annotations: WRITE_REMOTE
    },
    () => authenticate(cfg)
  )

  server.registerTool(
    'gsuite_auth_status',
    {
      description: 'Return the current authentication state. Does NOT expose token values — only presence, scope, and expiry.',
      inputSchema: z.object({}).strict(),
      outputSchema: authStatusOutput,
      annotations: READ_ONLY
    },
    () => authStatus(cfg)
  )
}
