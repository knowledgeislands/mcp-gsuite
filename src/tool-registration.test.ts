// Integration test for tool registration plumbing.
//
// The individual handlers are tested per feature (under src/main/<feature>/),
// but those tests can't catch a wiring mistake — e.g. registering a tool under
// the wrong name, or forgetting to call server.registerTool for one of the
// brief's tools. This test mocks an McpServer and asserts the full set of
// (name, config) pairs across all six register*Tools functions.
import type { McpServer } from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { Config } from './config/index.js'

// Schemas are registered as `z.object({...}).strict()`, so the field map lives
// on `.shape`. Older registrations passed a plain shape object directly —
// fall through to that case so this test stays correct during transitions.
const shapeOf = (schema: unknown): Record<string, unknown> => {
  if (schema && typeof schema === 'object' && 'shape' in schema)
    return (schema as { shape: Record<string, unknown> }).shape
  return schema as Record<string, unknown>
}

// Stub the auth-client module so the register functions don't need real Google
// credentials at import time.
vi.mock('./main/google-client/index.js', () => ({
  gmailService: vi.fn()
}))

vi.mock('./main/auth/index.js', () => ({
  redactedTokenSummary: vi.fn(() => ({
    authenticated: false,
    hasRefreshToken: false,
    scope: [],
    expiresAt: null,
    tokenStorePath: '/tmp/x'
  })),
  resetAuthClient: vi.fn()
}))

const { registerAuthTools } = await import('./tools/auth/index.js')
const { makeAccessGatedRegister } = await import('./utils/access-level.js')
const { WRITE_REMOTE } = await import('./utils/annotations.js')
const { registerLabelTools } = await import('./tools/labels/index.js')
const { registerFilterTools } = await import('./tools/filters/index.js')
const { registerHistoryTools } = await import('./tools/history/index.js')
const { registerMessageTools } = await import('./tools/messages/index.js')
const { registerAttachmentTools } = await import('./tools/attachments/index.js')
const { registerThreadTools } = await import('./tools/threads/index.js')
const { registerDraftTools } = await import('./tools/drafts/index.js')

// Config is injected into every register function; a stub with the slices the
// tool defs read (defaultSearchResults for description interpolation) suffices.
const cfg = { auth: {}, defaultSearchResults: 20 } as unknown as Config

interface RegistrationCall {
  name: string
  config: { description?: string; inputSchema?: object; annotations?: object }
  handler: (...args: unknown[]) => unknown
}

const makeMockServer = (): { server: McpServer; calls: RegistrationCall[] } => {
  const calls: RegistrationCall[] = []
  const server = {
    registerTool: (name: string, config: RegistrationCall['config'], handler: RegistrationCall['handler']) => {
      calls.push({ name, config, handler })
    }
  } as unknown as McpServer
  return { server, calls }
}

describe('registerAuthTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerAuthTools(server, cfg)
  })

  it('registers about, authenticate, and check-auth-status', () => {
    expect(calls.map((c) => c.name).sort()).toEqual(['gsuite_about', 'gsuite_auth_start', 'gsuite_auth_status'])
  })

  it('every tool has a callable handler', () => {
    for (const c of calls) expect(c.handler).toBeTypeOf('function')
  })

  it('every tool has a description and annotations', () => {
    for (const c of calls) {
      expect(c.config.description).toBeTypeOf('string')
      expect(c.config.description?.length).toBeGreaterThan(0)
      expect(c.config.annotations).toBeDefined()
    }
  })
})

describe('gsuite_auth_start through the access gate', () => {
  // The 401 hint and guides depend on this: sign-in is a write tool, absent at
  // the default read level and present once the operator raises the level.
  // Registration only; no handler runs, so no consent starts and no token is read.
  const registeredAt = (level: 'read' | 'write') => {
    const { server, calls } = makeMockServer()
    server.registerTool = makeAccessGatedRegister(server, level, {
      mode: 'off',
      path: '/nonexistent/audit.jsonl',
      maxBytes: 1,
      keep: 1
    })
    registerAuthTools(server, cfg)
    return calls
  }

  it('is not registered at the default read level', () => {
    const names = registeredAt('read').map((c) => c.name)
    expect(names).not.toContain('gsuite_auth_start')
    expect(names).toContain('gsuite_auth_status')
  })

  it('is registered at write with unchanged non-destructive write annotations', () => {
    const authStart = registeredAt('write').find((c) => c.name === 'gsuite_auth_start')
    expect(authStart?.config.annotations).toEqual(WRITE_REMOTE)
    expect(authStart?.config.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
  })
})

describe('registerLabelTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerLabelTools(server, cfg)
  })

  it('registers the five label tools', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_label_create',
      'gsuite_email_label_delete',
      'gsuite_email_label_get',
      'gsuite_email_label_update',
      'gsuite_email_labels_list'
    ])
  })

  it("'gsuite_email_label_create' requires a `name` param", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_create')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('name')
  })

  it("'gsuite_email_label_get' requires labelId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_get')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelId')
  })

  it("'gsuite_email_label_update' requires labelId + name", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_update')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('name')
  })

  it("'gsuite_email_label_delete' requires labelId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_delete')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelId')
  })
})
describe('registerFilterTools', () => {
  it('registers previewable filter management without forwarding', () => {
    const { server, calls } = makeMockServer()
    registerFilterTools(server, cfg)
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_filter_create',
      'gsuite_email_filter_delete',
      'gsuite_email_filters_list'
    ])
    expect(shapeOf(calls.find((c) => c.name === 'gsuite_email_filter_create')?.config.inputSchema)).not.toHaveProperty(
      'forward'
    )
    for (const c of calls) expect(c.config.annotations).toBeDefined()
  })
})

describe('registerMessageTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerMessageTools(server, cfg)
  })

  it('registers eleven message tools, including single-message modify', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_message_archive',
      'gsuite_email_message_get',
      'gsuite_email_message_label',
      'gsuite_email_message_mark_read',
      'gsuite_email_message_mark_unread',
      'gsuite_email_message_modify',
      'gsuite_email_message_raw',
      'gsuite_email_message_trash',
      'gsuite_email_message_unlabel',
      'gsuite_email_messages_batch_modify',
      'gsuite_email_messages_search'
    ])
  })

  it("'gsuite_email_messages_search' takes query + optional maxResults + labelIds", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_messages_search')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('query')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('maxResults')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelIds')
  })

  it("'gsuite_email_message_label' requires messageId + labelIds", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_message_label')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('messageId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelIds')
  })

  it("'gsuite_email_message_modify' requires bounded add/remove label arrays", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_message_modify')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('messageId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('addLabelIds')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('removeLabelIds')
    const schema = c?.config.inputSchema as z.ZodType
    expect(schema.safeParse({ messageId: 'm1', addLabelIds: ['X'] }).success).toBe(true)
    expect(schema.safeParse({ messageId: 'm1', removeLabelIds: ['X'] }).success).toBe(true)
    expect(schema.safeParse({ messageId: 'm1', addLabelIds: ['X'], removeLabelIds: ['Y'] }).success).toBe(true)
    for (const invalid of [
      { messageId: 'm1' },
      { messageId: 'm1', addLabelIds: [] },
      { messageId: 'm1', addLabelIds: ['X'], removeLabelIds: ['X'] },
      { messageId: 'm1', addLabelIds: ['X'], extra: true },
      { messageId: 'm1', addLabelIds: Array.from({ length: 101 }, () => 'X') }
    ]) {
      expect(schema.safeParse(invalid).success).toBe(false)
    }
  })

  it.each([
    'gsuite_email_message_mark_read',
    'gsuite_email_message_mark_unread',
    'gsuite_email_message_archive',
    'gsuite_email_message_trash'
  ])("'%s' requires only `messageId`", (name) => {
    const c = calls.find((c) => c.name === name)
    expect(shapeOf(c?.config.inputSchema)).toEqual({ messageId: expect.anything() })
  })

  it("'gsuite_email_messages_batch_modify' accepts ids + add/remove label arrays", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_messages_batch_modify')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('messageIds')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('addLabelIds')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('removeLabelIds')
  })
})

describe('registerAttachmentTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerAttachmentTools(server, cfg)
  })

  it('registers both attachment tools', () => {
    expect(calls.map((c) => c.name).sort()).toEqual(['gsuite_email_attachment_get', 'gsuite_email_attachment_metadata'])
  })

  it("'gsuite_email_attachment_get' requires messageId + attachmentId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_attachment_get')
    const shape = shapeOf(c?.config.inputSchema)
    expect(shape).toHaveProperty('messageId')
    expect(shape).toHaveProperty('attachmentId')
  })

  it("'gsuite_email_attachment_metadata' takes messageId + attachmentId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_attachment_metadata')
    expect(shapeOf(c?.config.inputSchema)).toEqual({ messageId: expect.anything(), attachmentId: expect.anything() })
  })
})

describe('registerThreadTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerThreadTools(server, cfg)
  })

  it('registers the eight thread tools (four core + four sugar)', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_thread_archive',
      'gsuite_email_thread_get',
      'gsuite_email_thread_label',
      'gsuite_email_thread_mark_read',
      'gsuite_email_thread_mark_unread',
      'gsuite_email_thread_trash',
      'gsuite_email_thread_unlabel',
      'gsuite_email_threads_search'
    ])
  })

  it("'gsuite_email_threads_search' takes query + pagination + labelIds", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_threads_search')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('query')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('maxResults')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('pageToken')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelIds')
  })

  it("'gsuite_email_thread_get' requires threadId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_thread_get')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('threadId')
  })

  it("'gsuite_email_thread_label' takes threadId + labelIds", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_thread_label')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('threadId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelIds')
  })

  it.each([
    'gsuite_email_thread_mark_read',
    'gsuite_email_thread_mark_unread',
    'gsuite_email_thread_archive',
    'gsuite_email_thread_trash'
  ])("'%s' requires only `threadId`", (name) => {
    const c = calls.find((c) => c.name === name)
    expect(shapeOf(c?.config.inputSchema)).toEqual({ threadId: expect.anything() })
  })
})

describe('registerDraftTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerDraftTools(server, cfg)
  })

  it('registers the six draft tools', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_draft_create',
      'gsuite_email_draft_delete',
      'gsuite_email_draft_forward',
      'gsuite_email_draft_get',
      'gsuite_email_draft_update',
      'gsuite_email_drafts_list'
    ])
  })

  it("'gsuite_email_draft_create' requires to + bodyText", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_draft_create')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('to')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('bodyText')
  })

  it("'gsuite_email_draft_create' supports reply convenience via replyToMessageId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_draft_create')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('replyToMessageId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('attachments')
  })

  it("'gsuite_email_draft_update' requires draftId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_draft_update')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('draftId')
  })

  it("'gsuite_email_drafts_list' supports pagination", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_drafts_list')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('pageToken')
  })

  it('there is no send_* tool exposed (drafts are outbound only via the user clicking Send)', () => {
    expect(calls.map((c) => c.name).filter((n) => n.includes('send'))).toEqual([])
  })
})

describe('registerHistoryTools', () => {
  it('registers a read-only checkpoint and bounded paginated history list', () => {
    const { server, calls } = makeMockServer()
    registerHistoryTools(server, cfg)
    expect(calls.map((c) => c.name).sort()).toEqual(['gsuite_email_history_checkpoint', 'gsuite_email_history_list'])
    const checkpoint = calls.find((c) => c.name === 'gsuite_email_history_checkpoint')
    const list = calls.find((c) => c.name === 'gsuite_email_history_list')
    expect(shapeOf(list?.config.inputSchema)).toHaveProperty('startHistoryId')
    expect(shapeOf(list?.config.inputSchema)).toHaveProperty('maxResults')
    expect(shapeOf(list?.config.inputSchema)).toHaveProperty('pageToken')
    expect(checkpoint?.config.annotations).toMatchObject({ readOnlyHint: true })
    expect(list?.config.annotations).toMatchObject({ readOnlyHint: true })
    const schema = list?.config.inputSchema as z.ZodType
    expect(
      schema.safeParse({ startHistoryId: '900719925474099312345', maxResults: 500, pageToken: 'next' }).success
    ).toBe(true)
    for (const invalid of [
      { startHistoryId: '1.5' },
      { startHistoryId: '1', maxResults: 501 },
      { startHistoryId: '1', pageToken: '' },
      { startHistoryId: '1', unexpected: true }
    ])
      expect(schema.safeParse(invalid).success).toBe(false)
  })
})

describe('combined registration (matches the brief)', () => {
  it('the register*Tools functions expose exactly the 40 tools, with no send_* tool', () => {
    const { server, calls } = makeMockServer()
    registerAuthTools(server, cfg)
    registerLabelTools(server, cfg)
    registerFilterTools(server, cfg)
    registerHistoryTools(server, cfg)
    registerMessageTools(server, cfg)
    registerAttachmentTools(server, cfg)
    registerThreadTools(server, cfg)
    registerDraftTools(server, cfg)

    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_about',
      'gsuite_auth_start',
      'gsuite_auth_status',
      'gsuite_email_attachment_get',
      'gsuite_email_attachment_metadata',
      'gsuite_email_draft_create',
      'gsuite_email_draft_delete',
      'gsuite_email_draft_forward',
      'gsuite_email_draft_get',
      'gsuite_email_draft_update',
      'gsuite_email_drafts_list',
      'gsuite_email_filter_create',
      'gsuite_email_filter_delete',
      'gsuite_email_filters_list',
      'gsuite_email_history_checkpoint',
      'gsuite_email_history_list',
      'gsuite_email_label_create',
      'gsuite_email_label_delete',
      'gsuite_email_label_get',
      'gsuite_email_label_update',
      'gsuite_email_labels_list',
      'gsuite_email_message_archive',
      'gsuite_email_message_get',
      'gsuite_email_message_label',
      'gsuite_email_message_mark_read',
      'gsuite_email_message_mark_unread',
      'gsuite_email_message_modify',
      'gsuite_email_message_raw',
      'gsuite_email_message_trash',
      'gsuite_email_message_unlabel',
      'gsuite_email_messages_batch_modify',
      'gsuite_email_messages_search',
      'gsuite_email_thread_archive',
      'gsuite_email_thread_get',
      'gsuite_email_thread_label',
      'gsuite_email_thread_mark_read',
      'gsuite_email_thread_mark_unread',
      'gsuite_email_thread_trash',
      'gsuite_email_thread_unlabel',
      'gsuite_email_threads_search'
    ])
    expect(calls.map((c) => c.name).filter((n) => n.includes('send'))).toEqual([])
  })
})
