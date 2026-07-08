/**
 * OAuth and token management for the Gmail API.
 *
 * Token persistence is **atomic**: writes go to `<path>.tmp.<pid>.<rand>` and
 * then `rename()` into place. POSIX guarantees `rename` is atomic on the same
 * filesystem, so a crash mid-write can never leave the token file truncated.
 *
 * Tokens are **never logged**. `redactedTokenSummary()` returns metadata
 * (presence flags, scope, expiry) only — no `access_token` / `refresh_token`
 * values ever leave this module.
 *
 * Every entry point takes the `AuthConfig` slice of the loaded `Config` as its
 * first argument — there is no module-level config read here. The only
 * process-lifetime state is the cached `OAuth2Client` (invalidated via
 * `resetAuthClient()`), keyed implicitly by the most recent caller's config.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { CodeChallengeMethod, type Credentials } from 'google-auth-library'
import { google } from 'googleapis'
import type { OAuth2Client } from 'googleapis-common'
import type { AuthConfig } from '../../config/index.js'

const atomicWrite = (filePath: string, contents: string): void => {
  const tmp = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, filePath)
}

const persistTokens = (tokenStorePath: string, tokens: Credentials): void => {
  atomicWrite(tokenStorePath, JSON.stringify(tokens, null, 2))
}

const loadTokensFromDisk = (tokenStorePath: string): Credentials | null => {
  if (!fs.existsSync(tokenStorePath)) return null
  try {
    return JSON.parse(fs.readFileSync(tokenStorePath, 'utf8')) as Credentials
  } catch {
    return null
  }
}

export const buildOAuthClient = (auth: AuthConfig): OAuth2Client => {
  if (!auth.clientId || !auth.clientSecret) {
    throw new Error('MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET must be set')
  }
  return new google.auth.OAuth2(auth.clientId, auth.clientSecret, auth.redirectUri)
}

export interface PkcePair {
  /** The high-entropy secret kept server-side until the callback. */
  codeVerifier: string
  /** base64url(SHA-256(codeVerifier)) — sent to Google with the auth request. */
  codeChallenge: string
}

const base64Url = (buf: Buffer): string => buf.toString('base64url')

/**
 * Generate a fresh PKCE verifier/challenge pair (RFC 7636, S256). The verifier
 * is 32 random bytes base64url-encoded (43 chars, well inside the 43–128 range);
 * the challenge is the base64url SHA-256 of the verifier. One pair per auth flow,
 * stored alongside that flow's `state` so the callback can only redeem the code
 * with the verifier minted for that exact state.
 */
export const generatePkcePair = (): PkcePair => {
  const codeVerifier = base64Url(crypto.randomBytes(32))
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

/**
 * Build the Google consent URL for one flow, binding it to the supplied `state`
 * and PKCE `codeChallenge` (S256). The matching `codeVerifier` must be replayed
 * to {@link exchangeAuthCode} at the callback.
 */
export const buildAuthUrl = (auth: AuthConfig, params: { state: string; codeChallenge: string }): string => {
  const client = buildOAuthClient(auth)
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: auth.scopes,
    prompt: 'consent',
    state: params.state,
    include_granted_scopes: true,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: params.codeChallenge
  })
}

/**
 * Exchange an authorization code for tokens, replaying the `codeVerifier` minted
 * for this flow's `state` so Google can verify the PKCE binding. Returns the raw
 * `Credentials` (caller persists them); never logs token values.
 */
export const exchangeAuthCode = async (auth: AuthConfig, params: { code: string; codeVerifier: string }): Promise<Credentials> => {
  const client = buildOAuthClient(auth)
  const { tokens } = await client.getToken({ code: params.code, codeVerifier: params.codeVerifier })
  return tokens
}

let cachedClient: OAuth2Client | null = null

/**
 * Returns an OAuth2Client primed with persisted tokens and a `tokens` event
 * handler that persists refreshes atomically. Throws if no token file exists
 * (caller should surface a "run authenticate" error).
 */
export const getAuthClient = (auth: AuthConfig): OAuth2Client => {
  if (cachedClient) return cachedClient

  const tokens = loadTokensFromDisk(auth.tokenStorePath)
  if (!tokens?.access_token && !tokens?.refresh_token) {
    throw new Error(`No tokens found at ${auth.tokenStorePath}. Run the \`gsuite_auth_start\` tool or \`mcp-gsuite-auth\` to grant access.`)
  }

  const client = buildOAuthClient(auth)
  client.setCredentials(tokens)

  // googleapis emits `tokens` when it refreshes the access_token. Google only
  // returns a refresh_token on first consent, so preserve the existing one if
  // the refresh response omits it.
  client.on('tokens', (refreshed) => {
    persistTokens(auth.tokenStorePath, { ...tokens, ...refreshed })
  })

  cachedClient = client
  return client
}

export const resetAuthClient = (): void => {
  cachedClient = null
}

export const saveTokensFromAuthFlow = (auth: AuthConfig, tokens: Credentials): void => {
  persistTokens(auth.tokenStorePath, tokens)
  cachedClient = null // force re-read on next API call
}

export interface TokenSummary {
  authenticated: boolean
  hasRefreshToken: boolean
  scope: string[]
  expiresAt: number | null
  tokenStorePath: string
}

/**
 * Returns metadata about the persisted token without ever exposing the token
 * values themselves. Safe to return from an MCP tool.
 */
export const redactedTokenSummary = (auth: AuthConfig): TokenSummary => {
  const tokens = loadTokensFromDisk(auth.tokenStorePath)
  if (!tokens?.access_token) {
    return { authenticated: false, hasRefreshToken: false, scope: [], expiresAt: null, tokenStorePath: auth.tokenStorePath }
  }
  return {
    authenticated: true,
    hasRefreshToken: Boolean(tokens.refresh_token),
    scope: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [],
    expiresAt: tokens.expiry_date ?? null,
    tokenStorePath: auth.tokenStorePath
  }
}
