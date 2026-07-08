/**
 * Tests for env-var-driven config branches. `loadConfig(env)` takes the
 * environment explicitly, so each test passes an env literal instead of
 * mutating process.env + resetting modules.
 */
import { describe, expect, it, vi } from 'vitest'

// A baseline env with the required vars set, so individual tests only override
// the keys they care about.
const baseEnv = (): NodeJS.ProcessEnv => ({
  HOME: '/home/test',
  MCP_GSUITE_CLIENT_ID: 'cid',
  MCP_GSUITE_CLIENT_SECRET: 'cs'
})

describe('parseScopes (via auth.scopes)', () => {
  it('defaults to GSUITE_DEFAULT_SCOPES when MCP_GSUITE_SCOPES is unset', async () => {
    const { GSUITE_DEFAULT_SCOPES, loadConfig } = await import('./index.js')
    expect(loadConfig(baseEnv()).auth.scopes).toEqual(GSUITE_DEFAULT_SCOPES)
    expect(GSUITE_DEFAULT_SCOPES).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets'
    ])
  })

  it('parses a space-separated MCP_GSUITE_SCOPES value', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({
      ...baseEnv(),
      MCP_GSUITE_SCOPES: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email'
    })
    expect(cfg.auth.scopes).toEqual(['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/userinfo.email'])
  })

  it('tolerates extra whitespace (newlines, tabs, multiple spaces) between scopes', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ ...baseEnv(), MCP_GSUITE_SCOPES: '  scope.one   scope.two\tscope.three\n scope.four ' })
    expect(cfg.auth.scopes).toEqual(['scope.one', 'scope.two', 'scope.three', 'scope.four'])
  })

  it('falls back to the default when MCP_GSUITE_SCOPES is set but empty/whitespace', async () => {
    const { GSUITE_DEFAULT_SCOPES, loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_SCOPES: '   ' }).auth.scopes).toEqual(GSUITE_DEFAULT_SCOPES)
  })
})

describe('auth paths and ports', () => {
  it('uses MCP_GSUITE_TOKEN_PATH when set', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_TOKEN_PATH: '/tmp/my-custom-tokens.json' }).auth.tokenStorePath).toBe(
      '/tmp/my-custom-tokens.json'
    )
  })

  it('defaults tokenStorePath to ~/.mcp-gsuite-tokens.json when MCP_GSUITE_TOKEN_PATH is unset', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig(baseEnv()).auth.tokenStorePath).toMatch(/\.mcp-gsuite-tokens\.json$/)
  })

  it('uses MCP_GSUITE_AUTH_PORT when set', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ ...baseEnv(), MCP_GSUITE_AUTH_PORT: '4444' })
    expect(cfg.auth.authServerPort).toBe(4444)
    expect(cfg.auth.authServerUrl).toBe('http://localhost:4444')
  })

  it('defaults the redirect URI to the configured port', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_AUTH_PORT: '5555' }).auth.redirectUri).toBe('http://localhost:5555/auth/callback')
  })

  it('uses MCP_GSUITE_REDIRECT_URI verbatim when set', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_REDIRECT_URI: 'http://example.test/cb' }).auth.redirectUri).toBe('http://example.test/cb')
  })
})

describe('homeDir fallback chain (HOME || USERPROFILE || os.homedir() || "/tmp")', () => {
  it('uses HOME when set (token path under $HOME)', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ HOME: '/home/alice', MCP_GSUITE_CLIENT_ID: 'cid', MCP_GSUITE_CLIENT_SECRET: 'cs' })
    expect(cfg.auth.tokenStorePath).toBe('/home/alice/.mcp-gsuite-tokens.json')
  })

  it('falls back to USERPROFILE when HOME is unset (Windows-style)', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ USERPROFILE: 'C:\\Users\\bob', MCP_GSUITE_CLIENT_ID: 'cid', MCP_GSUITE_CLIENT_SECRET: 'cs' })
    expect(cfg.auth.tokenStorePath).toMatch(/\.mcp-gsuite-tokens\.json$/)
    expect(cfg.auth.tokenStorePath.startsWith('C:\\Users\\bob')).toBe(true)
  })

  it('falls back to os.homedir() when both HOME and USERPROFILE are unset', async () => {
    vi.resetModules()
    vi.doMock('node:os', async () => {
      const real = await vi.importActual<typeof import('node:os')>('node:os')
      return { ...real, default: { ...real, homedir: () => '/fake/homedir' }, homedir: () => '/fake/homedir' }
    })
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ MCP_GSUITE_CLIENT_ID: 'cid', MCP_GSUITE_CLIENT_SECRET: 'cs' })
    expect(cfg.auth.tokenStorePath).toBe('/fake/homedir/.mcp-gsuite-tokens.json')
    vi.doUnmock('node:os')
    vi.resetModules()
  })

  it('falls back to /tmp when HOME, USERPROFILE, and os.homedir() all yield falsy', async () => {
    vi.resetModules()
    vi.doMock('node:os', async () => {
      const real = await vi.importActual<typeof import('node:os')>('node:os')
      return { ...real, default: { ...real, homedir: () => '' }, homedir: () => '' }
    })
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ MCP_GSUITE_CLIENT_ID: 'cid', MCP_GSUITE_CLIENT_SECRET: 'cs' })
    expect(cfg.auth.tokenStorePath).toBe('/tmp/.mcp-gsuite-tokens.json')
    vi.doUnmock('node:os')
    vi.resetModules()
  })
})

describe('parseAccessLevel (via accessLevel)', () => {
  it('defaults to read when unset', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig(baseEnv()).accessLevel).toBe('read')
  })

  it('accepts the valid explicit levels write and destructive', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_ACCESS_LEVEL: 'write' }).accessLevel).toBe('write')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_ACCESS_LEVEL: 'destructive' }).accessLevel).toBe('destructive')
  })

  it('throws on an unrecognized MCP_GSUITE_ACCESS_LEVEL', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_ACCESS_LEVEL: 'superuser' })).toThrow(/Invalid MCP_GSUITE_ACCESS_LEVEL/)
  })
})

describe('parseInlineMax (via inlineAttachmentMaxBytes)', () => {
  it('defaults to 256 KiB when unset', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig(baseEnv()).inlineAttachmentMaxBytes).toBe(256 * 1024)
  })

  it('parses a positive integer override', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES: '4096' }).inlineAttachmentMaxBytes).toBe(4096)
  })

  it('throws on a non-numeric MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES: 'lots' })).toThrow(
      /Invalid MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES/
    )
  })

  it('throws on a non-positive MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES: '0' })).toThrow(
      /Invalid MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES/
    )
  })
})

describe('auth client id / secret passthrough', () => {
  it('threads empty strings through when client id/secret are unset', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ HOME: '/home/test' })
    expect(cfg.auth.clientId).toBe('')
    expect(cfg.auth.clientSecret).toBe('')
  })

  it('threads the configured client id / secret through', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ HOME: '/home/test', MCP_GSUITE_CLIENT_ID: 'real-id', MCP_GSUITE_CLIENT_SECRET: 'real-secret' })
    expect(cfg.auth.clientId).toBe('real-id')
    expect(cfg.auth.clientSecret).toBe('real-secret')
  })
})

describe('audit and download config', () => {
  it('defaults auditLogMode to writes and threads rotation defaults', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig(baseEnv())
    expect(cfg.auditLogMode).toBe('writes')
    expect(cfg.auditLogMaxBytes).toBe(10 * 1024 * 1024)
    expect(cfg.auditLogKeep).toBe(5)
    expect(cfg.auditLogPath).toMatch(/audit\.jsonl$/)
  })

  it('rejects an invalid MCP_GSUITE_AUDIT_LOG value', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG: 'sometimes' })).toThrow(/Invalid MCP_GSUITE_AUDIT_LOG/)
  })

  it('rejects an invalid MCP_GSUITE_AUDIT_LOG_MAX_BYTES value', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG_MAX_BYTES: 'lots' })).toThrow(/Invalid MCP_GSUITE_AUDIT_LOG_MAX_BYTES/)
  })

  it('rejects a negative MCP_GSUITE_AUDIT_LOG_KEEP value', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG_KEEP: '-1' })).toThrow(/Invalid MCP_GSUITE_AUDIT_LOG_KEEP/)
  })

  it('parses valid MCP_GSUITE_AUDIT_LOG_MAX_BYTES / KEEP overrides (including 0)', async () => {
    const { loadConfig } = await import('./index.js')
    const cfg = loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG_MAX_BYTES: '0', MCP_GSUITE_AUDIT_LOG_KEEP: '7' })
    expect(cfg.auditLogMaxBytes).toBe(0)
    expect(cfg.auditLogKeep).toBe(7)
  })

  it('rejects a non-numeric MCP_GSUITE_AUDIT_LOG_KEEP value (NaN branch)', async () => {
    const { loadConfig } = await import('./index.js')
    expect(() => loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG_KEEP: 'lots' })).toThrow(/Invalid MCP_GSUITE_AUDIT_LOG_KEEP/)
  })

  it('accepts the audit-log mode aliases off / all', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG: 'off' }).auditLogMode).toBe('off')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG: 'all' }).auditLogMode).toBe('all')
  })

  it('uses MCP_GSUITE_DOWNLOAD_PATH when set; defaults to ~/Downloads otherwise', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_DOWNLOAD_PATH: '/tmp/dl' }).downloadPath).toBe('/tmp/dl')
    expect(loadConfig(baseEnv()).downloadPath).toBe('/home/test/Downloads')
  })

  it('uses MCP_GSUITE_AUDIT_LOG_PATH when set', async () => {
    const { loadConfig } = await import('./index.js')
    expect(loadConfig({ ...baseEnv(), MCP_GSUITE_AUDIT_LOG_PATH: '/tmp/a.jsonl' }).auditLogPath).toBe('/tmp/a.jsonl')
  })
})

describe('hydrateEnvFromFiles (via loadConfig)', () => {
  // Every loadConfig call hydrates process.env from the package's `.env*`
  // files; that step branches on whether NODE_ENV is set (it adds a
  // `.env.${NODE_ENV}` candidate). Exercise both arms. Values still come from
  // the explicit env literal, so the observable contract is simply that
  // hydration is NODE_ENV-agnostic and never throws when a file is absent.
  it('loads regardless of whether NODE_ENV is set', async () => {
    const { loadConfig } = await import('./index.js')
    const original = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      expect(loadConfig(baseEnv()).auth.clientId).toBe('cid')

      delete process.env.NODE_ENV
      expect(loadConfig(baseEnv()).auth.clientId).toBe('cid')
    } finally {
      if (original === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = original
    }
  })
})
