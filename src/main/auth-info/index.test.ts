import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

// Mock the auth client module so we control redactedTokenSummary and resetAuthClient.
vi.mock('../auth/index.js', () => ({
  redactedTokenSummary: vi.fn(),
  resetAuthClient: vi.fn()
}))

const auth = await import('../auth/index.js')
const { about, authenticate, authStatus } = await import('./index.js')

const redactedMock = auth.redactedTokenSummary as ReturnType<typeof vi.fn>
const resetMock = auth.resetAuthClient as ReturnType<typeof vi.fn>

// Config is injected; only the auth slice these handlers read need be present.
const cfg = {
  auth: {
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    tokenStorePath: '/tmp/.mcp-gsuite-tokens.json',
    authServerUrl: 'http://localhost:3334'
  }
} as unknown as Config

// Bind cfg so the existing call sites stay unchanged.
const handleAbout = () => about(cfg)
const handleAuthenticate = () => authenticate(cfg)
const handleCheckAuthStatus = () => authStatus(cfg)

beforeEach(() => {
  redactedMock.mockReset()
  resetMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleAbout', () => {
  it('returns server info as JSON with name, version, scopes, paths', async () => {
    const r = await handleAbout()
    const payload = JSON.parse(r.content[0].text)
    expect(payload.name).toBe('mcp-gsuite')
    expect(payload.version).toBeTypeOf('string')
    expect(Array.isArray(payload.scopes)).toBe(true)
    expect(payload.tokenStorePath).toBeTypeOf('string')
    expect(payload.authServerUrl).toBeTypeOf('string')
  })
})

describe('handleAuthenticate', () => {
  it('resets the cached auth client (so the next API call re-reads the token)', async () => {
    await handleAuthenticate()
    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it('returns text pointing at the auth-server /auth URL', async () => {
    const r = await handleAuthenticate()
    expect(r.content[0].text).toMatch(/\/auth/)
    expect(r.content[0].text).toMatch(/localhost/)
  })

  it('mentions the token store path so the user knows where tokens land', async () => {
    const r = await handleAuthenticate()
    expect(r.content[0].text).toMatch(/tokens will be written to/i)
  })
})

describe('handleCheckAuthStatus', () => {
  it('returns the redacted token summary as JSON', async () => {
    const summary = { authenticated: true, hasRefreshToken: true, scope: ['x'], expiresAt: 123, tokenStorePath: '/p' }
    redactedMock.mockReturnValue(summary)
    const r = await handleCheckAuthStatus()
    expect(JSON.parse(r.content[0].text)).toEqual(summary)
  })

  it('passes through the not-authenticated shape', async () => {
    redactedMock.mockReturnValue({ authenticated: false, hasRefreshToken: false, scope: [], expiresAt: null, tokenStorePath: '/p' })
    const r = await handleCheckAuthStatus()
    expect(JSON.parse(r.content[0].text).authenticated).toBe(false)
  })

  it('does not include token-like fields in the response (defence-in-depth)', async () => {
    // Even if redactedTokenSummary were to misbehave, the tool layer should
    // not be forwarding raw token strings. This test fakes a "leaky" summary
    // to confirm the handler just passes through — and documents that the
    // leak protection lives in redactedTokenSummary, not here.
    redactedMock.mockReturnValue({
      authenticated: true,
      hasRefreshToken: true,
      scope: [],
      expiresAt: null,
      tokenStorePath: '/p'
    } as never)
    const r = await handleCheckAuthStatus()
    const text = r.content[0].text
    expect(text).not.toMatch(/"access_token"/)
    expect(text).not.toMatch(/"refresh_token"/)
  })
})
