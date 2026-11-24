/**
 * The server is draft-only: no registered tool may send mail or a calendar
 * response. Every tool group registers through the access gate at every access
 * level — `destructive` is the widest, and no other configuration adds tools —
 * and the surface must hold no sending tool. Registration only: no handler runs.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { ACCESS_LEVELS, type AccessLevel, type Config } from '../config/index.js'

// Registration must never reach Google; stub the client factories and token store.
vi.mock('../main/google-client/index.js', () => ({
  gmailService: vi.fn(),
  calendarService: vi.fn(),
  driveService: vi.fn(),
  sheetsService: vi.fn()
}))
vi.mock('../main/auth/index.js', () => ({ redactedTokenSummary: vi.fn(), resetAuthClient: vi.fn() }))

const tools = await import('./index.js')
const { makeAccessGatedRegister } = await import('../utils/access-level.js')

const cfg = { auth: {}, defaultSearchResults: 20 } as unknown as Config

const registeredAt = (level: AccessLevel): Map<string, { inputSchema?: z.ZodType }> => {
  const registered = new Map<string, { inputSchema?: z.ZodType }>()
  const server = {
    registerTool: (name: string, config: { inputSchema?: z.ZodType }) => {
      registered.set(name, config)
    }
  } as unknown as McpServer
  server.registerTool = makeAccessGatedRegister(server, level, {
    mode: 'off',
    path: '/nonexistent/audit.jsonl',
    maxBytes: 1,
    keep: 1
  })
  for (const register of Object.values(tools)) register(server, cfg)
  return registered
}

// A sending verb as a whole name segment. The reply and forward draft tools save
// a draft only and are the one sanctioned use of those verbs; a draft tool that
// sends, such as a `_draft_send`, is still caught.
const SENDING = /(^|_)(send|reply|reply_all|forward|accept|decline|cancel|tentative|respond|invite)(_|$)/
const isSending = (name: string) => SENDING.test(name) && !/^gsuite_email_draft_(reply|reply_all|forward)$/.test(name)

describe('the draft-only tool surface', () => {
  it.each(ACCESS_LEVELS)('registers no sending tool at the %s access level', (level) => {
    const names = [...registeredAt(level).keys()]
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter(isSending)).toEqual([])
  })

  it('keeps the draft tools at the write level', () => {
    expect([...registeredAt('write').keys()]).toEqual(
      expect.arrayContaining(['gsuite_email_draft_create', 'gsuite_email_draft_update', 'gsuite_email_draft_forward'])
    )
  })

  it.each([
    'gsuite_email_message_send',
    'gsuite_email_draft_send',
    'gsuite_email_message_reply',
    'gsuite_email_message_forward',
    'gsuite_calendar_event_accept',
    'gsuite_calendar_event_decline',
    'gsuite_calendar_event_cancel'
  ])('the pattern recognises a sending name such as %s', (name) => {
    expect(isSending(name)).toBe(true)
  })

  it.each(['gsuite_calendar_event_create', 'gsuite_calendar_event_update'])(
    'refuses attendees on %s at the tool boundary',
    (name) => {
      const schema = registeredAt('destructive').get(name)?.inputSchema
      const event = { eventId: 'e1', summary: 'Focus', start: '2026-01-01T09:00:00Z', end: '2026-01-01T10:00:00Z' }
      const args = name.endsWith('_create') ? { summary: event.summary, start: event.start, end: event.end } : event
      expect(schema?.safeParse(args).success).toBe(true)
      expect(schema?.safeParse({ ...args, attendees: ['a@example.com'] }).success).toBe(false)
    }
  )
})
