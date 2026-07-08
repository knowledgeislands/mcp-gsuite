import crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { google } from 'googleapis'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from '../../config/index.js'
import {
  buildAuthUrl,
  buildOAuthClient,
  exchangeAuthCode,
  generatePkcePair,
  getAuthClient,
  redactedTokenSummary,
  resetAuthClient,
  saveTokensFromAuthFlow
} from './index.js'

// Config is injected, so each test builds an AuthConfig literal pointing at a
// per-run temp token file — no env mutation or module-reset dance needed.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-auth-'))
const tokenPath = path.join(tmpDir, 'tokens.json')

const auth: AuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3334/auth/callback',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  tokenStorePath: tokenPath,
  authServerPort: 3334,
  authServerUrl: 'http://localhost:3334'
}

const writeToken = (tokens: object): void => {
  fs.writeFileSync(tokenPath, JSON.stringify(tokens), 'utf8')
}

const removeToken = (): void => {
  try {
    fs.unlinkSync(tokenPath)
  } catch {
    /* not present */
  }
}

beforeEach(() => {
  resetAuthClient()
})

afterEach(() => {
  resetAuthClient()
  removeToken()
  // Clean up any lingering temp files from atomic writes.
  for (const f of fs.readdirSync(tmpDir)) {
    if (f.startsWith('tokens.json.tmp.')) {
      try {
        fs.unlinkSync(path.join(tmpDir, f))
      } catch {
        /* ignore */
      }
    }
  }
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildOAuthClient', () => {
  it('returns an OAuth2Client when client_id and client_secret are set', () => {
    const client = buildOAuthClient(auth)
    expect(client).toBeDefined()
    // OAuth2Client exposes a generateAuthUrl method
    expect(typeof client.generateAuthUrl).toBe('function')
  })

  it('throws when clientId is missing', () => {
    expect(() => buildOAuthClient({ ...auth, clientId: '' })).toThrow(/MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET must be set/)
  })

  it('throws when clientSecret is missing', () => {
    expect(() => buildOAuthClient({ ...auth, clientSecret: '' })).toThrow(/MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET must be set/)
  })

  it('throws when both are missing', () => {
    expect(() => buildOAuthClient({ ...auth, clientId: '', clientSecret: '' })).toThrow(
      /MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET must be set/
    )
  })
})

describe('generatePkcePair (PKCE S256)', () => {
  it('returns a verifier in the RFC 7636 unreserved alphabet, 43 chars (base64url of 32 bytes)', () => {
    const { codeVerifier } = generatePkcePair()
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(codeVerifier.length).toBe(43)
  })

  it('derives the challenge as base64url(SHA-256(verifier))', () => {
    const { codeVerifier, codeChallenge } = generatePkcePair()
    const expected = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    expect(codeChallenge).toBe(expected)
  })

  it('mints a fresh, distinct pair on every call', () => {
    const a = generatePkcePair()
    const b = generatePkcePair()
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
    expect(a.codeChallenge).not.toBe(b.codeChallenge)
  })
})

describe('buildAuthUrl (PKCE + state binding)', () => {
  it('embeds the state, S256 challenge method, and code_challenge in the consent URL', () => {
    const { codeChallenge } = generatePkcePair()
    const url = new URL(buildAuthUrl(auth, { state: 'st-123', codeChallenge }))
    expect(url.searchParams.get('state')).toBe('st-123')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(codeChallenge)
    // Least-privilege / offline-consent params are preserved.
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('scope')).toBe(auth.scopes.join(' '))
  })

  it('throws (via buildOAuthClient) when credentials are missing', () => {
    expect(() => buildAuthUrl({ ...auth, clientId: '' }, { state: 's', codeChallenge: 'c' })).toThrow(
      /MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET must be set/
    )
  })
})

describe('exchangeAuthCode (PKCE code exchange)', () => {
  it('replays the codeVerifier to getToken and returns the raw credentials', async () => {
    const tokens = { access_token: 'a', refresh_token: 'r' }
    const getToken = vi.fn().mockResolvedValue({ tokens })
    // OAuth2Client.getToken is what carries the PKCE verifier to Google.
    const spy = vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockImplementation(getToken as never)
    try {
      const result = await exchangeAuthCode(auth, { code: 'the-code', codeVerifier: 'the-verifier' })
      expect(result).toEqual(tokens)
      expect(getToken).toHaveBeenCalledWith({ code: 'the-code', codeVerifier: 'the-verifier' })
    } finally {
      spy.mockRestore()
    }
  })
})

describe('saveTokensFromAuthFlow / atomic write', () => {
  it('writes the token file with mode 0600', () => {
    saveTokensFromAuthFlow(auth, { access_token: 'a', refresh_token: 'r', expiry_date: 123 })
    const stat = fs.statSync(tokenPath)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('writes valid JSON containing the token fields', () => {
    saveTokensFromAuthFlow(auth, { access_token: 'access-1', refresh_token: 'refresh-1', expiry_date: 999 })
    const parsed = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    expect(parsed).toMatchObject({ access_token: 'access-1', refresh_token: 'refresh-1', expiry_date: 999 })
  })

  it('leaves no lingering temp files after a successful write', () => {
    saveTokensFromAuthFlow(auth, { access_token: 'a' })
    const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith('tokens.json.tmp.'))
    expect(tmpFiles).toEqual([])
  })

  it('invalidates the cached OAuth2Client so the next getAuthClient re-reads the token', () => {
    saveTokensFromAuthFlow(auth, { access_token: 'first', refresh_token: 'r1' })
    const c1 = getAuthClient(auth)
    saveTokensFromAuthFlow(auth, { access_token: 'second', refresh_token: 'r2' })
    const c2 = getAuthClient(auth)
    expect(c1).not.toBe(c2)
  })
})

describe('getAuthClient', () => {
  it('throws when no token file exists', () => {
    expect(() => getAuthClient(auth)).toThrow(/No tokens found at/)
  })

  it('throws when token file exists but has no access_token and no refresh_token', () => {
    writeToken({ scope: 'https://www.googleapis.com/auth/gmail.modify' })
    expect(() => getAuthClient(auth)).toThrow(/No tokens found at/)
  })

  it('returns an OAuth2Client when token file has access_token', () => {
    writeToken({ access_token: 'a' })
    const client = getAuthClient(auth)
    expect(client).toBeDefined()
    expect(client.credentials?.access_token).toBe('a')
  })

  it('accepts a token file with only refresh_token (e.g. before first access_token refresh)', () => {
    writeToken({ refresh_token: 'r' })
    const client = getAuthClient(auth)
    expect(client.credentials?.refresh_token).toBe('r')
  })

  it('caches the client across calls until reset', () => {
    writeToken({ access_token: 'a' })
    const c1 = getAuthClient(auth)
    const c2 = getAuthClient(auth)
    expect(c1).toBe(c2)
  })

  it('resetAuthClient invalidates the cache so the next call re-reads', () => {
    writeToken({ access_token: 'first' })
    const c1 = getAuthClient(auth)
    resetAuthClient()
    writeToken({ access_token: 'second' })
    const c2 = getAuthClient(auth)
    expect(c1).not.toBe(c2)
    expect(c2.credentials?.access_token).toBe('second')
  })
})

describe("OAuth2Client 'tokens' event handler persistence", () => {
  it('persists refreshed tokens to disk and preserves the existing refresh_token when Google omits it', () => {
    writeToken({ access_token: 'old', refresh_token: 'rkeep', scope: 'gmail.modify' })
    const client = getAuthClient(auth)
    // Simulate googleapis emitting a refresh — only access_token + expiry_date,
    // no refresh_token (Google's typical behaviour after first consent).
    client.emit('tokens', { access_token: 'new', expiry_date: 9_999_999_999_999 })
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    expect(persisted.access_token).toBe('new')
    expect(persisted.refresh_token).toBe('rkeep') // preserved
    expect(persisted.expiry_date).toBe(9_999_999_999_999)
  })

  it('persists a new refresh_token when Google sends one (rare but legal)', () => {
    writeToken({ access_token: 'a', refresh_token: 'rold' })
    const client = getAuthClient(auth)
    client.emit('tokens', { access_token: 'a2', refresh_token: 'rnew' })
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    expect(persisted.refresh_token).toBe('rnew')
  })

  it('refresh persistence is atomic (mode 0600, no temp files left)', () => {
    writeToken({ access_token: 'a', refresh_token: 'r' })
    const client = getAuthClient(auth)
    client.emit('tokens', { access_token: 'new' })
    const stat = fs.statSync(tokenPath)
    expect(stat.mode & 0o777).toBe(0o600)
    const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith('tokens.json.tmp.'))
    expect(tmpFiles).toEqual([])
  })
})

describe('redactedTokenSummary', () => {
  it('returns the not-authenticated shape when no token file exists', () => {
    const s = redactedTokenSummary(auth)
    expect(s).toEqual({
      authenticated: false,
      hasRefreshToken: false,
      scope: [],
      expiresAt: null,
      tokenStorePath: tokenPath
    })
  })

  it('returns not-authenticated when the token file is present but has no access_token', () => {
    writeToken({ refresh_token: 'r' })
    const s = redactedTokenSummary(auth)
    expect(s.authenticated).toBe(false)
  })

  it('returns malformed-file → not-authenticated (rather than throwing)', () => {
    fs.writeFileSync(tokenPath, 'not-json', 'utf8')
    expect(redactedTokenSummary(auth).authenticated).toBe(false)
  })

  it('returns the authenticated shape with scope split into an array and expiry surfaced', () => {
    writeToken({
      access_token: 'a',
      refresh_token: 'r',
      scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
      expiry_date: 1234567890
    })
    expect(redactedTokenSummary(auth)).toEqual({
      authenticated: true,
      hasRefreshToken: true,
      scope: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/userinfo.email'],
      expiresAt: 1234567890,
      tokenStorePath: tokenPath
    })
  })

  it('reports hasRefreshToken=false when refresh_token is absent', () => {
    writeToken({ access_token: 'a' })
    expect(redactedTokenSummary(auth).hasRefreshToken).toBe(false)
  })

  it('NEVER returns access_token or refresh_token values', () => {
    writeToken({
      access_token: 'SECRET_ACCESS_VALUE_xyz',
      refresh_token: 'SECRET_REFRESH_VALUE_abc',
      id_token: 'SECRET_ID_VALUE_def'
    })
    const s = redactedTokenSummary(auth)
    const serialised = JSON.stringify(s)
    expect(serialised).not.toContain('SECRET_ACCESS_VALUE_xyz')
    expect(serialised).not.toContain('SECRET_REFRESH_VALUE_abc')
    expect(serialised).not.toContain('SECRET_ID_VALUE_def')
  })

  it('handles missing or non-string scope gracefully', () => {
    writeToken({ access_token: 'a' })
    expect(redactedTokenSummary(auth).scope).toEqual([])
  })

  it('returns null for expiresAt when expiry_date is absent', () => {
    writeToken({ access_token: 'a' })
    expect(redactedTokenSummary(auth).expiresAt).toBeNull()
  })
})
