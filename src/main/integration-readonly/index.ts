/** Explicitly gated read-only verification; never prints provider data or errors. */
import fs from 'node:fs'
import path from 'node:path'
import { type Config, GSUITE_DEFAULT_SCOPES } from '../../config/index.js'
import { resetAuthClient } from '../auth/index.js'
import { listEvents } from '../calendar/index.js'
import { listFiles } from '../drive-client/index.js'
import { getAuthorizedClient, gmailService } from '../google-client/index.js'
import { listLabels } from '../labels/index.js'

interface ReadResult {
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

export interface ReadOnlyProbe {
  profile(): Promise<string | null | undefined>
  labels(): Promise<ReadResult>
  calendar(): Promise<ReadResult>
  drive(): Promise<ReadResult>
}

export type IntegrationOutcome =
  | { ok: true; identityVerified: true; labels: number; calendarEvents: number; driveFiles: number }
  | { ok: false; reason: 'disabled' | 'configuration' | 'credentials' | 'identity' | 'provider' }

/** Reuse production auth, Google SDK and read handlers rather than a second client. */
export const createReadOnlyProbe = (cfg: Config): ReadOnlyProbe => {
  // Load/validate only the dedicated credentials before the first provider call.
  getAuthorizedClient(cfg.auth)
  return {
    profile: async () =>
      (await gmailService(cfg.auth).users.getProfile({ userId: 'me', fields: 'emailAddress' })).data.emailAddress,
    labels: () => listLabels(cfg),
    calendar: () => listEvents(cfg, { calendarId: 'primary', maxResults: 5 }),
    drive: () => listFiles(cfg, { folderId: 'root', pageSize: 5 })
  }
}

const count = (result: ReadResult, field: string, maximum: number): number => {
  const values = result.structuredContent?.[field]
  if (result.isError || !Array.isArray(values) || values.length > maximum) throw new Error('Invalid read result')
  return values.length
}

/**
 * Trusted environment and probe factory are injectable for offline verification.
 * No environment, token file or provider is accessed at module import time.
 * Call in a dedicated process: the ordinary auth cache is reset on entry/exit.
 */
export const runReadOnlyIntegration = async (
  env: NodeJS.ProcessEnv,
  createProbe: (cfg: Config) => ReadOnlyProbe = createReadOnlyProbe
): Promise<IntegrationOutcome> => {
  if (env.INTEGRATION !== '1') return { ok: false, reason: 'disabled' }
  let reason: 'configuration' | 'credentials' | 'provider' = 'configuration'
  try {
    const email = env.MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL?.trim()
    const tokenPath = env.MCP_GSUITE_INTEGRATION_TOKEN_PATH
    const clientId = env.MCP_GSUITE_CLIENT_ID?.trim()
    const clientSecret = env.MCP_GSUITE_CLIENT_SECRET?.trim()
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !tokenPath ||
      !path.isAbsolute(tokenPath) ||
      path.basename(tokenPath) !== 'integration-oauth-tokens.json' ||
      !clientId ||
      !clientSecret ||
      (env.MCP_GSUITE_TOKEN_PATH?.trim() && path.resolve(env.MCP_GSUITE_TOKEN_PATH.trim()) === tokenPath)
    )
      return { ok: false, reason }
    reason = 'credentials'
    const file = fs.lstatSync(tokenPath)
    if (
      !file.isFile() ||
      file.nlink !== 1 ||
      (file.mode & 0o777) !== 0o600 ||
      file.size > 64 * 1024 ||
      fs.realpathSync(tokenPath) !== tokenPath
    )
      return { ok: false, reason }

    const credentials: unknown = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return { ok: false, reason }
    const tokens = credentials as Record<string, unknown>
    const tokenValues = [tokens.access_token, tokens.refresh_token].filter((value) => value !== undefined)
    if (
      tokenValues.length === 0 ||
      tokenValues.some((value) => typeof value !== 'string' || value.trim().length === 0)
    ) {
      return { ok: false, reason }
    }

    // Deliberately avoid loadConfig(): its dotenv hydration and ordinary token
    // defaults are inappropriate for this independently designated account.
    const cfg: Config = {
      accessLevel: 'read',
      auth: {
        clientId,
        clientSecret,
        tokenStorePath: tokenPath,
        redirectUri: 'http://localhost:3334/auth/callback',
        scopes: [...GSUITE_DEFAULT_SCOPES],
        authServerPort: 3334,
        authServerUrl: 'http://localhost:3334'
      },
      defaultSearchResults: 5,
      auditLogMode: 'off',
      auditLogPath: '',
      auditLogMaxBytes: 0,
      auditLogKeep: 0,
      downloadPath: path.dirname(tokenPath),
      inlineAttachmentMaxBytes: 256 * 1024
    }
    resetAuthClient()
    const probe = createProbe(cfg)
    reason = 'provider'
    const actualEmail = await probe.profile()
    if (typeof actualEmail !== 'string' || actualEmail.toLowerCase() !== email.toLowerCase()) {
      return { ok: false, reason: 'identity' }
    }
    // One page per API, sequentially; fail before any subsequent read on error.
    // Gmail label listing has no page-size option; reject excessive results.
    const labels = count(await probe.labels(), 'labels', 10_000)
    const calendarEvents = count(await probe.calendar(), 'events', 5)
    const driveFiles = count(await probe.drive(), 'files', 5)
    return { ok: true, identityVerified: true, labels, calendarEvents, driveFiles }
  } catch {
    // Google errors may include request headers, tokens and mailbox content.
    return { ok: false, reason }
  } finally {
    resetAuthClient()
  }
}
