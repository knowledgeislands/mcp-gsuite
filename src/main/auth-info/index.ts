/**
 * Server-level auth metadata handlers (`about`, `authenticate`, `auth_status`).
 * Each takes the loaded `Config` as its first argument. None of these touch the
 * Gmail API; `authenticate` only drops the cached OAuth client and returns the
 * auth-server URL, and `authStatus` surfaces the redacted token summary.
 */

import type { Config } from '../../config/index.js'
import { SERVER_NAME, SERVER_VERSION } from '../../config/index.js'
import { jsonResult, textResult } from '../../utils/results.js'
import { redactedTokenSummary, resetAuthClient } from '../auth/index.js'

export const about = async (cfg: Config) =>
  jsonResult({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    scopes: cfg.auth.scopes,
    tokenStorePath: cfg.auth.tokenStorePath,
    authServerUrl: cfg.auth.authServerUrl
  })

export const authenticate = async (cfg: Config) => {
  // Drop any cached OAuth2Client so the next API call re-reads the token
  // file after consent completes.
  resetAuthClient()
  return textResult(
    `Open this URL in a browser to authorize mcp-gsuite:\n\n${cfg.auth.authServerUrl}/auth\n\nIf the auth server isn't running, start it with \`bun run server:auth:dev\` (or \`bun run server:auth:start\` in production). ` +
      `After consent, tokens will be written to ${cfg.auth.tokenStorePath}.`
  )
}

export const authStatus = async (cfg: Config) => jsonResult(redactedTokenSummary(cfg.auth))
