import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessLevel } from '../config/index.js'
import type { AuditConfig } from './audit-log.js'

describe('appendAuditEvent / withAuditLog (mcp-gsuite)', () => {
  const tmpDir = path.join(os.tmpdir(), 'mcp-gsuite-audit-log-tests', `run-${process.pid}-${Date.now()}`)
  const logPath = path.join(tmpDir, 'audit.jsonl')

  // Build an AuditConfig literal; tests override only the fields they need.
  const auditCfg = (over: Partial<AuditConfig> = {}): AuditConfig => ({
    mode: 'writes',
    path: logPath,
    maxBytes: 10 * 1024 * 1024,
    keep: 5,
    ...over
  })

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    vi.resetModules()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const flushAsync = () => new Promise((r) => setTimeout(r, 20))

  it('appends an event for a destructive-level tool with the server name set', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'd1' })
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.server).toBe('mcp-gsuite')
    expect(event.tool).toBe('gsuite_email_draft_delete')
    expect(event.level).toBe('destructive')
    expect(event.ok).toBe(true)
    expect(event.args).toEqual({ draftId: 'd1' })
  })

  it('redacts bodyText / bodyHtml / body / htmlBody / rawMessage / attachment* / OAuth code+state fields', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_create', 'write', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({
      to: ['a@x'],
      bodyText: 'plain body text — the actual draft field name',
      bodyHtml: '<p>html — the actual draft field name</p>',
      body: 'plain body text body body',
      htmlBody: '<p>html</p>',
      rawMessage: 'RAW===',
      attachmentData: 'BASE64',
      data: 'more',
      code: 'oauth-code',
      state: 'oauth-state'
    })
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    for (const k of ['bodyText', 'bodyHtml', 'body', 'htmlBody', 'rawMessage', 'attachmentData', 'data', 'code', 'state']) {
      expect(event.args[k]).toMatch(/^\[redacted \d+B\]$/)
    }
    // Non-redacted args pass through untouched.
    expect(event.args.to).toEqual(['a@x'])
  })

  it('redacts user:pass@ credentials from URL strings nested in args (string / array / object / primitive branches)', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_create', 'write', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({
      url: 'https://user:tok3n@example.com/x',
      urls: ['https://user:tok3n@example.com/a', 'no-creds-here'],
      nested: { inner: 'https://user:tok3n@example.com/b', count: 42 }
    })
    await flushAsync()
    const raw = await fs.readFile(logPath, 'utf-8')
    expect(raw).not.toContain('tok3n')
    const event = JSON.parse(raw.trim())
    expect(event.args.url).toBe('https://<redacted>@example.com/x')
    expect(event.args.urls).toEqual(['https://<redacted>@example.com/a', 'no-creds-here'])
    expect(event.args.nested.inner).toBe('https://<redacted>@example.com/b')
    expect(event.args.nested.count).toBe(42)
  })

  it('records ok:false + error text when isError:true', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => ({
      isError: true,
      content: [{ type: 'text', text: 'gone' }]
    }))
    await wrapped({ draftId: 'd1' })
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.ok).toBe(false)
    expect(event.error).toBe('gone')
  })

  it('skips read-level tools by default', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }))
    expect(withAuditLog(auditCfg(), 'gsuite_email_messages_search', 'read', handler)).toBe(handler)
  })

  it('logs read-level tools when mode is "all"', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ mode: 'all' }), 'gsuite_email_messages_search', 'read', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ query: 'x' })
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.level).toBe('read')
  })

  it('skips all levels when mode is "off"', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const writeHandler = vi.fn(async (_args: unknown) => ({ content: [{ type: 'text', text: 'ok' }] }))
    expect(withAuditLog(auditCfg({ mode: 'off' }), 'gsuite_email_draft_delete', 'destructive', writeHandler)).toBe(writeHandler)
    await writeHandler({})
    await flushAsync()
    await expect(fs.access(logPath)).rejects.toThrow()
  })

  it('creates the audit log with mode 0o600 and chmods an existing 0o644 log down to 0o600', async () => {
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.writeFile(logPath, '', { mode: 0o644 })
    expect(((await fs.stat(logPath)).mode & 0o777).toString(8)).toBe('644')

    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({})
    await flushAsync()

    const mode = (await fs.stat(logPath)).mode & 0o777
    expect(mode.toString(8)).toBe('600')
  })

  it('infers level=read from READ_ONLY annotations (via makeAccessGatedRegister)', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string; handler: (args: unknown) => Promise<unknown> }[] = []
    const stub = {
      registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => calls.push({ name, handler })
    }
    const wrapped = makeAccessGatedRegister(stub as never, 'destructive', auditCfg({ mode: 'all' }))
    wrapped('gsuite_email_messages_list', { annotations: { readOnlyHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await calls[0].handler({})
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.level).toBe('read')
  })

  it('infers level=write from explicit non-destructive write annotations (via makeAccessGatedRegister)', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string; handler: (args: unknown) => Promise<unknown> }[] = []
    const stub = {
      registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => calls.push({ name, handler })
    }
    const wrapped = makeAccessGatedRegister(stub as never, 'destructive', auditCfg())
    wrapped('gsuite_email_message_send', { annotations: { readOnlyHint: false, destructiveHint: false } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await calls[0].handler({})
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.level).toBe('write')
  })

  it('infers level=destructive from destructive annotations (via makeAccessGatedRegister)', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string; handler: (args: unknown) => Promise<unknown> }[] = []
    const stub = {
      registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => calls.push({ name, handler })
    }
    const wrapped = makeAccessGatedRegister(stub as never, 'destructive', auditCfg())
    wrapped('gsuite_email_draft_delete', { annotations: { readOnlyHint: false, destructiveHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await calls[0].handler({})
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.level).toBe('destructive')
  })

  it('skips registration when the tool level exceeds the configured level (default = read only)', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string }[] = []
    const stub = { registerTool: (name: string, _config: unknown, _handler: unknown) => calls.push({ name }) }
    const wrapped = makeAccessGatedRegister(stub as never, 'read', auditCfg())
    wrapped('gsuite_email_messages_list', { annotations: { readOnlyHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    wrapped('gsuite_email_draft_delete', { annotations: { readOnlyHint: false, destructiveHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    expect(calls.map((c) => c.name)).toEqual(['gsuite_email_messages_list'])
  })

  it('registers read + write but skips destructive when accessLevel=write', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string }[] = []
    const stub = { registerTool: (name: string, _config: unknown, _handler: unknown) => calls.push({ name }) }
    const wrapped = makeAccessGatedRegister(stub as never, 'write', auditCfg())
    wrapped('gsuite_email_messages_list', { annotations: { readOnlyHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    wrapped('gsuite_email_message_send', { annotations: { readOnlyHint: false, destructiveHint: false } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    wrapped('gsuite_email_draft_delete', { annotations: { readOnlyHint: false, destructiveHint: true } }, async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    expect(calls.map((c) => c.name)).toEqual(['gsuite_email_messages_list', 'gsuite_email_message_send'])
  })

  it('treats an unannotated tool as destructive (fail-safe — skipped when read-only is the configured level)', async () => {
    const { makeAccessGatedRegister } = await import('./access-level.js')
    const calls: { name: string }[] = []
    const stub = { registerTool: (name: string, _config: unknown, _handler: unknown) => calls.push({ name }) }
    const wrapped = makeAccessGatedRegister(stub as never, 'read', auditCfg())
    wrapped('unannotated_tool', {}, async () => ({ content: [{ type: 'text', text: 'ok' }] }))
    expect(calls).toEqual([])
  })

  it('passes through non-object args (array / primitive) without sanitization', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped(['a', 'b'])
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.args).toEqual(['a', 'b'])
  })

  it('records ok:false + error message when the handler throws (and re-throws)', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => {
      throw new Error('kaboom')
    })
    await expect(wrapped({ draftId: 'd1' })).rejects.toThrow(/kaboom/)
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.ok).toBe(false)
    expect(event.error).toBe('kaboom')
  })

  it('stringifies non-Error throws into the audit log (and re-throws)', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => {
      throw 'string-throw'
    })
    await expect(wrapped({})).rejects.toBe('string-throw')
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.error).toBe('string-throw')
  })

  it('omits error on an isError result that has no text content block', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(
      auditCfg(),
      'gsuite_email_draft_delete',
      'destructive',
      async () => ({ isError: true }) as unknown as { content: { type: string; text: string }[] }
    )
    await wrapped({})
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.ok).toBe(false)
    expect(event.error).toBeUndefined()
  })

  it('truncates oversized argument payloads with a _truncated marker', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_create', 'write', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    // Use a non-redacted key so the raw payload reaches the size check.
    await wrapped({ subject: 'x'.repeat(8000) })
    await flushAsync()
    const event = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(event.args._truncated).toBe(true)
    expect(typeof event.args.preview).toBe('string')
  })

  it('silently absorbs write failures (non-writable parent dir) — the tool still succeeds', async () => {
    const noPermsPath = path.join(tmpDir, 'no-perms', 'audit.jsonl')
    await fs.mkdir(path.dirname(noPermsPath), { recursive: true })
    await fs.chmod(path.dirname(noPermsPath), 0o500)

    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ path: noPermsPath }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = (await wrapped({})) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.text).toBe('ok')
    await flushAsync()
    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining('[audit-log] failed to write'))
    consoleErr.mockRestore()

    await fs.chmod(path.dirname(noPermsPath), 0o700)
  })

  it('rotates the audit log when it exceeds maxBytes', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 64 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'a' })
    await flushAsync()
    await wrapped({ draftId: 'b' })
    await flushAsync()
    const rotated = await fs.readFile(`${logPath}.1`, 'utf-8')
    expect(rotated.length).toBeGreaterThan(0)
  })

  it('discards the live log when keep=0', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 64, keep: 0 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'a' })
    await flushAsync()
    await wrapped({ draftId: 'b' })
    await flushAsync()
    await expect(fs.access(`${logPath}.1`)).rejects.toThrow()
  })

  it('shifts existing rotation slots when rotating', async () => {
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.writeFile(`${logPath}.1`, 'prior-rotation\n', { mode: 0o600 })

    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 64, keep: 3 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'a' })
    await flushAsync()
    await wrapped({ draftId: 'b' })
    await flushAsync()

    const three = await fs.readFile(`${logPath}.3`, 'utf-8')
    expect(three).toBe('prior-rotation\n')
  })

  it('is a no-op when maxBytes=0 (rotation disabled)', async () => {
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 0 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'a' })
    await flushAsync()
    await wrapped({ draftId: 'b' })
    await flushAsync()
    await expect(fs.access(`${logPath}.1`)).rejects.toThrow()
  })

  it('logs to stderr (best-effort) when rotation itself fails', async () => {
    // keep=1 so the rotation does `rm ${log}.1` then `rename(live → .1)` with no
    // slot-shift loop in between — wedging `.1` as a non-empty directory makes the
    // `fs.rm` (force, non-recursive) throw EISDIR, hitting the outer rotate catch.
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 64, keep: 1 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    await wrapped({ draftId: 'a' })
    await flushAsync()
    // First append already rotated live → `.1`; replace `.1` with a non-empty dir
    // so the next rotation's `rm ${log}.1` throws.
    await fs.rm(`${logPath}.1`, { recursive: true, force: true })
    await fs.mkdir(`${logPath}.1`)
    await fs.writeFile(path.join(`${logPath}.1`, 'blocker'), 'x')

    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    await wrapped({ draftId: 'b' })
    await flushAsync()
    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining('[audit-log] rotation failed'))
    consoleErr.mockRestore()
    // Clean up the wedged directory so afterEach's rm can remove tmpDir cleanly.
    await fs.rm(`${logPath}.1`, { recursive: true, force: true })
  })

  it('stringifies a non-Error write rejection into the stderr message', async () => {
    vi.doMock('node:fs/promises', async () => {
      const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      const appendFile = () => Promise.reject('append-string-failure')
      return { ...real, default: { ...real, appendFile }, appendFile }
    })
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg(), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = (await wrapped({ draftId: 'a' })) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.text).toBe('ok')
    await flushAsync()
    expect(consoleErr).toHaveBeenCalledWith('[audit-log] failed to write: append-string-failure')
    consoleErr.mockRestore()
    vi.doUnmock('node:fs/promises')
  })

  it('stringifies a non-Error rotation rejection into the stderr message', async () => {
    vi.doMock('node:fs/promises', async () => {
      const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      // stat reports an oversized file so rotation runs; rm rejects with a
      // non-Error so the rotate catch hits the String(err) branch.
      const stat = () => Promise.resolve({ size: 999 } as Awaited<ReturnType<typeof real.stat>>)
      const rm = () => Promise.reject('rm-string-failure')
      return { ...real, default: { ...real, stat, rm }, stat, rm }
    })
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 1 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    await wrapped({ draftId: 'a' })
    await flushAsync()
    expect(consoleErr).toHaveBeenCalledWith('[audit-log] rotation failed: rm-string-failure')
    consoleErr.mockRestore()
    vi.doUnmock('node:fs/promises')
  })

  it('skips rotation silently when the live log cannot be stat-ed', async () => {
    // Force fs.stat to reject inside rotateIfNeeded (e.g. the file vanished
    // between append and stat) — the catch returns and the append still succeeds.
    vi.doMock('node:fs/promises', async () => {
      const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return { ...real, default: { ...real, stat: () => Promise.reject(new Error('boom')) }, stat: () => Promise.reject(new Error('boom')) }
    })
    const { withAuditLog } = await import('./audit-log.js')
    const wrapped = withAuditLog(auditCfg({ maxBytes: 64 }), 'gsuite_email_draft_delete', 'destructive', async () => ({
      content: [{ type: 'text', text: 'ok' }]
    }))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = (await wrapped({ draftId: 'a' })) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.text).toBe('ok')
    await flushAsync()
    // stat-failure is absorbed by rotateIfNeeded's catch — not the write catch.
    expect(consoleErr).not.toHaveBeenCalled()
    consoleErr.mockRestore()
    vi.doUnmock('node:fs/promises')
    await expect(fs.access(`${logPath}.1`)).rejects.toThrow()
  })

  it('appendAuditEvent serialises events to the configured path', async () => {
    const { appendAuditEvent } = await import('./audit-log.js')
    const event = {
      ts: new Date().toISOString(),
      server: 'mcp-gsuite',
      tool: 't',
      level: 'write' as AccessLevel,
      ok: true,
      duration_ms: 1,
      args: { a: 1 }
    }
    await appendAuditEvent(auditCfg(), event)
    await flushAsync()
    const written = JSON.parse((await fs.readFile(logPath, 'utf-8')).trim())
    expect(written.tool).toBe('t')
  })
})
