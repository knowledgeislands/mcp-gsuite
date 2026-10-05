import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Gaxios, type GaxiosOptions } from 'googleapis-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'
import { resetAuthClient } from '../auth/index.js'
import { getAuthorizedClient } from '../google-client/index.js'
import { createReadOnlyProbe, type ReadOnlyProbe, runReadOnlyIntegration } from './index.js'

const realRequest = Gaxios.prototype.request
const EMAIL = 'disposable@example.invalid'
const SECRET = 'SYNTHETIC_TOKEN_AND_PRIVATE_MAILBOX_PAYLOAD'
let directory: string
let tokenPath: string
let env: NodeJS.ProcessEnv

beforeEach(() => {
  // Fail closed if any test accidentally reaches an uninjected transport.
  vi.spyOn(Gaxios.prototype, 'request').mockRejectedValue(
    new Error('Real network disabled in offline integration tests')
  )
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gsuite-readonly-')))
  tokenPath = path.join(directory, 'integration-oauth-tokens.json')
  fs.writeFileSync(tokenPath, JSON.stringify({ access_token: SECRET, expiry_date: Date.now() + 3_600_000 }), {
    mode: 0o600
  })
  env = {
    INTEGRATION: '1',
    MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL: EMAIL,
    MCP_GSUITE_INTEGRATION_TOKEN_PATH: tokenPath,
    MCP_GSUITE_CLIENT_ID: 'synthetic-client',
    MCP_GSUITE_CLIENT_SECRET: 'synthetic-secret'
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  resetAuthClient()
  fs.rmSync(directory, { recursive: true, force: true })
})

const probe = (): ReadOnlyProbe => ({
  profile: vi.fn().mockResolvedValue(EMAIL),
  labels: vi.fn().mockResolvedValue({ structuredContent: { labels: [] } }),
  calendar: vi.fn().mockResolvedValue({ structuredContent: { events: [] } }),
  drive: vi.fn().mockResolvedValue({ structuredContent: { files: [] } })
})

const noProvider = async (reason: string) => {
  const factory = vi.fn(() => probe())
  expect(await runReadOnlyIntegration(env, factory)).toEqual({ ok: false, reason })
  expect(factory).not.toHaveBeenCalled()
}

describe('fail-closed gates', () => {
  it.each([undefined, '', '0', 'true', ' 1', '1 '])('requires the exact opt-in (%s)', async (value) => {
    env.INTEGRATION = value
    const stat = vi.spyOn(fs, 'lstatSync')
    await noProvider('disabled')
    expect(stat).not.toHaveBeenCalled()
  })

  it.each([
    ['MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL', undefined],
    ['MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL', ' '],
    ['MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL', 'invalid'],
    ['MCP_GSUITE_INTEGRATION_TOKEN_PATH', undefined],
    ['MCP_GSUITE_INTEGRATION_TOKEN_PATH', 'integration-oauth-tokens.json'],
    ['MCP_GSUITE_INTEGRATION_TOKEN_PATH', '/tmp/oauth-tokens.json'],
    ['MCP_GSUITE_CLIENT_ID', undefined],
    ['MCP_GSUITE_CLIENT_ID', ' '],
    ['MCP_GSUITE_CLIENT_SECRET', undefined],
    ['MCP_GSUITE_CLIENT_SECRET', ' ']
  ])('requires explicit configuration %s=%s before file access', async (key, value) => {
    env[key] = value
    const stat = vi.spyOn(fs, 'lstatSync')
    await noProvider('configuration')
    expect(stat).not.toHaveBeenCalled()
  })

  it('rejects the ordinary configured token path', async () => {
    env.MCP_GSUITE_TOKEN_PATH = tokenPath
    await noProvider('configuration')
  })

  it('rejects whitespace around the ordinary configured token path', async () => {
    env.MCP_GSUITE_TOKEN_PATH = `  ${tokenPath}  `
    await noProvider('configuration')
  })

  it('allows an empty ordinary override without selecting or reading its default', async () => {
    env.MCP_GSUITE_TOKEN_PATH = ' '
    expect((await runReadOnlyIntegration(env, () => probe())).ok).toBe(true)
  })

  it('allows a different ordinary token path without accessing it', async () => {
    env.MCP_GSUITE_TOKEN_PATH = path.join(directory, 'not-read.json')
    expect((await runReadOnlyIntegration(env, () => probe())).ok).toBe(true)
  })

  it.each(['absent', 'directory', 'symlink', 'hardlink', 'permissions', 'oversized', 'ancestor-symlink'])(
    'rejects %s dedicated credentials',
    async (kind) => {
      if (kind === 'absent') fs.unlinkSync(tokenPath)
      if (kind === 'directory') {
        fs.unlinkSync(tokenPath)
        fs.mkdirSync(tokenPath)
      }
      if (kind === 'symlink') {
        fs.renameSync(tokenPath, `${tokenPath}.source`)
        fs.symlinkSync(`${tokenPath}.source`, tokenPath)
      }
      if (kind === 'hardlink') fs.linkSync(tokenPath, `${tokenPath}.alias`)
      if (kind === 'permissions') fs.chmodSync(tokenPath, 0o644)
      if (kind === 'oversized') fs.writeFileSync(tokenPath, 'x'.repeat(64 * 1024 + 1))
      if (kind === 'ancestor-symlink') {
        const nested = path.join(directory, 'nested')
        fs.mkdirSync(nested)
        fs.renameSync(tokenPath, path.join(nested, 'integration-oauth-tokens.json'))
        fs.symlinkSync(nested, path.join(directory, 'alias'))
        env.MCP_GSUITE_INTEGRATION_TOKEN_PATH = path.join(directory, 'alias', 'integration-oauth-tokens.json')
      }
      await noProvider('credentials')
    }
  )

  it.each([
    'invalid-json',
    '{}',
    'null',
    'false',
    '1',
    '"token"',
    '[]',
    '{"access_token":null}',
    '{"access_token":{}}',
    '{"access_token":1}',
    '{"access_token":""}',
    '{"access_token":" "}',
    '{"refresh_token":null}',
    '{"refresh_token":{}}',
    '{"refresh_token":1}',
    '{"refresh_token":""}',
    '{"refresh_token":" "}',
    '{"access_token":"synthetic","refresh_token":false}'
  ])('rejects malformed token contents before the probe factory: %s', async (contents) => {
    fs.writeFileSync(tokenPath, contents)
    await noProvider('credentials')
    expect(await runReadOnlyIntegration(env)).toEqual({ ok: false, reason: 'credentials' })
  })

  it('accepts a nonempty refresh token alone before checking identity', async () => {
    fs.writeFileSync(tokenPath, '{"refresh_token":"synthetic-refresh"}')
    expect((await runReadOnlyIntegration(env, () => probe())).ok).toBe(true)
  })

  it('suppresses credential exceptions', async () => {
    const factory = vi.fn(() => {
      throw new Error(SECRET)
    })
    expect(await runReadOnlyIntegration(env, factory)).toEqual({ ok: false, reason: 'credentials' })
  })
})

describe('identity, counts and privacy', () => {
  it.each(['another@example.invalid', undefined, null])(
    'stops before subsequent reads for identity %s',
    async (identity) => {
      const reads = probe()
      vi.mocked(reads.profile).mockResolvedValue(identity)
      expect(await runReadOnlyIntegration(env, () => reads)).toEqual({ ok: false, reason: 'identity' })
      expect(reads.labels).not.toHaveBeenCalled()
      expect(reads.calendar).not.toHaveBeenCalled()
      expect(reads.drive).not.toHaveBeenCalled()
    }
  )

  it('normalizes expected email whitespace and case, returning zero counts', async () => {
    env.MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL = `  ${EMAIL.toUpperCase()}  `
    expect(await runReadOnlyIntegration(env, () => probe())).toEqual({
      ok: true,
      identityVerified: true,
      labels: 0,
      calendarEvents: 0,
      driveFiles: 0
    })
  })

  it('returns only counts even when successful results contain private payloads', async () => {
    const reads = probe()
    vi.mocked(reads.labels).mockResolvedValue({ structuredContent: { labels: [{ name: SECRET }] } })
    vi.mocked(reads.calendar).mockResolvedValue({ structuredContent: { events: [{ summary: SECRET }, {}] } })
    vi.mocked(reads.drive).mockResolvedValue({ structuredContent: { files: [{ name: SECRET }] } })
    expect(await runReadOnlyIntegration(env, () => reads)).toEqual({
      ok: true,
      identityVerified: true,
      labels: 1,
      calendarEvents: 2,
      driveFiles: 1
    })
  })

  it.each(['profile', 'labels', 'calendar', 'drive'] as const)(
    'suppresses provider exceptions in %s and stops subsequent calls',
    async (method) => {
      const reads = probe()
      vi.mocked(reads[method]).mockRejectedValue(new Error(SECRET))
      expect(await runReadOnlyIntegration(env, () => reads)).toEqual({ ok: false, reason: 'provider' })
      const order = ['profile', 'labels', 'calendar', 'drive'] as const
      for (const subsequent of order.slice(order.indexOf(method) + 1)) expect(reads[subsequent]).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['labels', { isError: true }],
    ['labels', {}],
    ['labels', { structuredContent: {} }],
    ['labels', { structuredContent: { labels: 'private' } }],
    ['labels', { structuredContent: { labels: Array(10_001).fill(SECRET) } }],
    ['calendar', { structuredContent: { events: Array(6).fill(SECRET) } }],
    ['drive', { structuredContent: { files: Array(6).fill(SECRET) } }]
  ] as const)('rejects invalid or excessive %s results', async (method, value) => {
    const reads = probe()
    vi.mocked(reads[method]).mockResolvedValue(value)
    expect(await runReadOnlyIntegration(env, () => reads)).toEqual({ ok: false, reason: 'provider' })
    if (method === 'labels') expect(reads.calendar).not.toHaveBeenCalled()
    if (method !== 'drive') expect(reads.drive).not.toHaveBeenCalled()
  })

  it('accepts exact maximum counts', async () => {
    const reads = probe()
    vi.mocked(reads.labels).mockResolvedValue({ structuredContent: { labels: Array(10_000).fill({}) } })
    vi.mocked(reads.calendar).mockResolvedValue({ structuredContent: { events: Array(5).fill({}) } })
    vi.mocked(reads.drive).mockResolvedValue({ structuredContent: { files: Array(5).fill({}) } })
    expect(await runReadOnlyIntegration(env, () => reads)).toEqual({
      ok: true,
      identityVerified: true,
      labels: 10_000,
      calendarEvents: 5,
      driveFiles: 5
    })
  })
})

describe('offline real SDK transport', () => {
  const transportFactory = (calls: GaxiosOptions[], payload: (url: URL) => unknown) => (cfg: Config) => {
    const client = getAuthorizedClient(cfg.auth)
    // Run Gaxios serialization too, replacing only its final fetch transport.
    client.transporter.request = realRequest.bind(client.transporter)
    client.transporter.defaults.retry = false
    client.transporter.defaults.fetchImplementation = async (url, options) => {
      calls.push({ url: String(url), method: options?.method, headers: options?.headers })
      const data = payload(new URL(String(url)))
      if (data instanceof Response) return data
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    return createReadOnlyProbe(cfg)
  }

  const payload = (url: URL): unknown => {
    if (url.pathname.endsWith('/profile')) return { emailAddress: EMAIL }
    if (url.pathname.endsWith('/labels')) return { labels: [{ id: 'INBOX', name: SECRET }] }
    if (url.pathname.endsWith('/events')) return { items: [{ id: SECRET }] }
    if (url.pathname.endsWith('/files')) return { files: [{ id: SECRET }] }
    throw new Error(`Unexpected synthetic endpoint: ${url}`)
  }

  it('uses real read handlers and SDK GET requests with identity first and bounded query fields', async () => {
    const ordinaryToken = path.join(directory, 'ordinary-synthetic.json')
    fs.writeFileSync(
      ordinaryToken,
      JSON.stringify({ access_token: 'stale-synthetic-token', expiry_date: Date.now() + 3_600_000 }),
      { mode: 0o600 }
    )
    const ordinaryAuth = {
      clientId: 'ordinary-synthetic-client',
      clientSecret: 'ordinary-synthetic-secret',
      tokenStorePath: ordinaryToken,
      redirectUri: 'http://localhost:3334/auth/callback',
      scopes: [],
      authServerPort: 3334,
      authServerUrl: 'http://localhost:3334'
    }
    getAuthorizedClient(ordinaryAuth)
    const calls: GaxiosOptions[] = []
    expect(await runReadOnlyIntegration(env, transportFactory(calls, payload))).toEqual({
      ok: true,
      identityVerified: true,
      labels: 1,
      calendarEvents: 1,
      driveFiles: 1
    })
    expect(calls).toHaveLength(4)
    expect(calls.map((call) => call.method)).toEqual(['GET', 'GET', 'GET', 'GET'])
    const urls = calls.map((call) => new URL(String(call.url)))
    expect(urls.map((url) => url.pathname)).toEqual([
      '/gmail/v1/users/me/profile',
      '/gmail/v1/users/me/labels',
      '/calendar/v3/calendars/primary/events',
      '/drive/v3/files'
    ])
    expect(urls[0]?.searchParams.get('fields')).toBe('emailAddress')
    expect(urls[2]?.searchParams.get('maxResults')).toBe('5')
    expect(urls[3]?.searchParams.get('pageSize')).toBe('5')
    expect(urls[3]?.searchParams.get('fields')).toBe('files(id,name,mimeType,modifiedTime)')
    expect(urls[3]?.searchParams.get('q')).toBe("'root' in parents and trashed = false")
    expect(calls.every((call) => new Headers(call.headers).get('authorization') === `Bearer ${SECRET}`)).toBe(true)
    expect(getAuthorizedClient(ordinaryAuth).credentials.access_token).toBe('stale-synthetic-token')
  })

  it('makes only the real profile request when SDK identity mismatches', async () => {
    const calls: GaxiosOptions[] = []
    expect(
      await runReadOnlyIntegration(
        env,
        transportFactory(calls, () => ({ emailAddress: 'other@example.invalid' }))
      )
    ).toEqual({ ok: false, reason: 'identity' })
    expect(calls).toHaveLength(1)
  })

  it('suppresses raw SDK errors returned through the production handler error envelope', async () => {
    const calls: GaxiosOptions[] = []
    const failedPayload = (url: URL) =>
      url.pathname.endsWith('/profile')
        ? { emailAddress: EMAIL }
        : new Response(JSON.stringify({ error: { message: SECRET } }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          })
    expect(await runReadOnlyIntegration(env, transportFactory(calls, failedPayload))).toEqual({
      ok: false,
      reason: 'provider'
    })
    expect(calls).toHaveLength(2)
  })

  it('persists synthetic OAuth refresh only to the dedicated file using existing atomic 0600 storage', async () => {
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({ access_token: SECRET, refresh_token: 'synthetic-refresh', expiry_date: 1 })
    )
    const calls: GaxiosOptions[] = []
    const refreshedPayload = (url: URL) =>
      url.hostname === 'oauth2.googleapis.com'
        ? { access_token: 'synthetic-refreshed', expires_in: 3600, token_type: 'Bearer' }
        : payload(url)
    expect((await runReadOnlyIntegration(env, transportFactory(calls, refreshedPayload))).ok).toBe(true)
    expect(calls).toHaveLength(5)
    expect(calls[0]?.method).toBe('POST')
    expect(String(calls[0]?.url)).toBe('https://oauth2.googleapis.com/token')
    expect(JSON.parse(fs.readFileSync(tokenPath, 'utf8'))).toMatchObject({
      access_token: 'synthetic-refreshed',
      refresh_token: 'synthetic-refresh'
    })
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600)
    expect(fs.readdirSync(directory)).toEqual(['integration-oauth-tokens.json'])
  })
})
