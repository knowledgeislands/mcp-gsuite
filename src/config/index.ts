/**
 * Configuration loading. `loadConfig()` reads the environment (optionally
 * hydrated from the package's `.env*` files) into a plain `Config` value that is
 * passed explicitly into every main call — so the same code runs as an MCP
 * server, the auth server, or from a standalone script. There is NO
 * module-level config singleton: nothing here is read at import time.
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Package root, resolved from this module's own URL — NOT `process.cwd()`,
 * which is wherever the MCP host happened to launch `node dist/mcp-server/...`
 * from. Both layouts put this file two levels below the root
 * (`dist/config/index.js` and `src/config/index.ts`), so `../..` is correct
 * whether built or run from source.
 */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Hydrate `process.env` from the package's `.env*` files, mirroring the set and
 * precedence Bun auto-loads (highest first: `.env.local`, then
 * `.env.${NODE_ENV}` if NODE_ENV is set, then `.env`). `process.loadEnvFile`
 * never overwrites a key already present in `process.env`, so loading
 * highest-precedence first means earlier files win — and any value injected by
 * the host (e.g. the MCP client's `env` block) beats every file. Missing files
 * are skipped silently; under Bun this is largely redundant with its own
 * auto-load, which is fine.
 */
const hydrateEnvFromFiles = (): void => {
  const files = ['.env.local']
  if (process.env.NODE_ENV) files.push(`.env.${process.env.NODE_ENV}`)
  files.push('.env')
  for (const file of files) {
    try {
      process.loadEnvFile(path.join(PACKAGE_ROOT, file))
    } catch {
      // File absent or unreadable — skip; the value may come from the host env.
    }
  }
}

export const SERVER_NAME = 'mcp-gsuite'
export const SERVER_VERSION = '0.0.1'

/**
 * Single ordinal access level. Each level implies all lower ones:
 *   `read`        — only readOnly tools registered.
 *   `write`       — readOnly + non-destructive mutations (create, send, toggle).
 *   `destructive` — everything, including delete / overwrite / prune.
 *
 * The gate uses ACCESS_LEVEL_RANK for ordinal comparison; a tool registers when
 * its derived level ≤ the configured level.
 */
export type AccessLevel = 'read' | 'write' | 'destructive'
export const ACCESS_LEVELS: readonly AccessLevel[] = ['read', 'write', 'destructive'] as const
export const ACCESS_LEVEL_RANK: Record<AccessLevel, number> = { read: 1, write: 2, destructive: 3 }

/**
 * Scope of tool invocations to record. Default `writes` logs any tool whose
 * derived level is not `read` (i.e. `write` or `destructive`); `all` adds
 * `read` too; `off` disables logging entirely (the wrapper short-circuits and
 * never opens the file).
 */
export type AuditLogMode = 'off' | 'writes' | 'all'

/** The OAuth/token slice of Config that the auth client and auth server need. */
export interface AuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  tokenStorePath: string
  authServerPort: number
  authServerUrl: string
}

export interface Config {
  accessLevel: AccessLevel
  auth: AuthConfig
  defaultSearchResults: number
  auditLogMode: AuditLogMode
  auditLogPath: string
  auditLogMaxBytes: number
  auditLogKeep: number
  /**
   * Filesystem root where tools that take `outputPath` (attachment_get,
   * message_get_raw) are allowed to write. Defaults to ~/Downloads; override
   * with MCP_GSUITE_DOWNLOAD_PATH. Any caller-provided `outputPath` is resolved
   * relative to this root and rejected if it escapes (lexically or via symlink).
   */
  downloadPath: string
  /**
   * Maximum size (in decoded bytes) for inline `attachment_get` responses (no
   * `outputPath`). The base64url-encoded form in the JSON response is ~1.33× this,
   * so the default 256 KiB caps the on-wire size around 350 KB — well below the
   * MCP stdio transport's practical envelope. Above this, callers must use
   * `outputPath` to write to disk instead. Override with
   * MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES (positive integer).
   */
  inlineAttachmentMaxBytes: number
}

const parseAccessLevel = (raw: string | undefined): AccessLevel => {
  const v = raw?.trim()
  if (v === undefined || v === '') return 'read'
  if ((ACCESS_LEVELS as readonly string[]).includes(v)) return v as AccessLevel
  throw new Error(`Invalid MCP_GSUITE_ACCESS_LEVEL="${raw}". Allowed: ${ACCESS_LEVELS.join(', ')}`)
}

/**
 * The combined Google Workspace scope set — the single source of truth for
 * both consent and refresh (mirrors m365's M365_DEFAULT_SCOPES). One grant
 * covers every domain the server will expose: email today, calendar and
 * drive/sheets in later units. Override with MCP_GSUITE_SCOPES
 * (space-separated).
 */
export const GSUITE_DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets'
]

const parseScopes = (raw: string | undefined): string[] => {
  if (!raw?.trim()) return [...GSUITE_DEFAULT_SCOPES]
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const parseAuditLogMode = (raw: string | undefined): AuditLogMode => {
  const v = raw?.trim().toLowerCase()
  if (v === undefined || v === '') return 'writes'
  if (v === 'off' || v === 'writes' || v === 'all') return v
  throw new Error(`Invalid MCP_GSUITE_AUDIT_LOG="${raw}" — expected one of: off, writes, all.`)
}

/**
 * Size-based audit-log rotation. After each append, if `audit.jsonl` exceeds
 * MCP_GSUITE_AUDIT_LOG_MAX_BYTES (default 10 MiB), it's renamed to `audit.jsonl.1`
 * and older rotations shift up. MCP_GSUITE_AUDIT_LOG_KEEP (default 5) controls
 * how many rotated files survive. Set MAX_BYTES=0 to disable rotation.
 */
const parseNonNegativeInt = (raw: string | undefined, fallback: number, varName: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${varName}="${raw}" — expected a non-negative integer.`)
  }
  return n
}

const parseInlineMax = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES="${raw}" — expected a positive integer.`)
  }
  return n
}

export const DEFAULT_SEARCH_RESULTS = 20

/**
 * Load configuration from `env` (defaults to `process.env`, after hydrating it
 * from the package's `.env*` files — see `hydrateEnvFromFiles`). Throws if a
 * value fails validation.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  hydrateEnvFromFiles()

  const homeDir = env.HOME || env.USERPROFILE || os.homedir() || '/tmp'
  const authPort = Number.parseInt(env.MCP_GSUITE_AUTH_PORT || '3334', 10)

  return {
    accessLevel: parseAccessLevel(env.MCP_GSUITE_ACCESS_LEVEL),
    auth: {
      clientId: env.MCP_GSUITE_CLIENT_ID || '',
      clientSecret: env.MCP_GSUITE_CLIENT_SECRET || '',
      redirectUri: env.MCP_GSUITE_REDIRECT_URI || `http://localhost:${authPort}/auth/callback`,
      scopes: parseScopes(env.MCP_GSUITE_SCOPES),
      tokenStorePath: env.MCP_GSUITE_TOKEN_PATH?.trim()
        ? path.resolve(env.MCP_GSUITE_TOKEN_PATH.trim())
        : path.join(homeDir, '.mcp-gsuite-tokens.json'),
      authServerPort: authPort,
      authServerUrl: `http://localhost:${authPort}`
    },
    defaultSearchResults: DEFAULT_SEARCH_RESULTS,
    auditLogMode: parseAuditLogMode(env.MCP_GSUITE_AUDIT_LOG),
    auditLogPath: env.MCP_GSUITE_AUDIT_LOG_PATH?.trim()
      ? path.resolve(env.MCP_GSUITE_AUDIT_LOG_PATH.trim())
      : path.join(homeDir, '.local', 'state', 'mcp-gsuite', 'audit.jsonl'),
    auditLogMaxBytes: parseNonNegativeInt(env.MCP_GSUITE_AUDIT_LOG_MAX_BYTES, 10 * 1024 * 1024, 'MCP_GSUITE_AUDIT_LOG_MAX_BYTES'),
    auditLogKeep: parseNonNegativeInt(env.MCP_GSUITE_AUDIT_LOG_KEEP, 5, 'MCP_GSUITE_AUDIT_LOG_KEEP'),
    downloadPath: env.MCP_GSUITE_DOWNLOAD_PATH?.trim()
      ? path.resolve(env.MCP_GSUITE_DOWNLOAD_PATH.trim())
      : path.join(homeDir, 'Downloads'),
    inlineAttachmentMaxBytes: parseInlineMax(env.MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES, 256 * 1024)
  }
}
