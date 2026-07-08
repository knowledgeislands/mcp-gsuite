// Integration test for tool registration plumbing.
//
// The individual handlers are tested per feature (under src/main/<feature>/),
// but those tests can't catch a wiring mistake — e.g. registering a tool under
// the wrong name, or forgetting to call server.registerTool for one of the
// brief's tools. This test mocks an McpServer and asserts the full set of
// (name, config) pairs across all six register*Tools functions.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from './config/index.js'

// Schemas are registered as `z.object({...}).strict()`, so the field map lives
// on `.shape`. Older registrations passed a plain shape object directly —
// fall through to that case so this test stays correct during transitions.
const shapeOf = (schema: unknown): Record<string, unknown> => {
  if (schema && typeof schema === 'object' && 'shape' in schema) return (schema as { shape: Record<string, unknown> }).shape
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
const { registerLabelTools } = await import('./tools/labels/index.js')
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

describe('registerLabelTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerLabelTools(server, cfg)
  })

  it('registers the four label tools', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_label_create',
      'gsuite_email_label_delete',
      'gsuite_email_label_update',
      'gsuite_email_labels_list'
    ])
  })

  it("'gsuite_email_label_create' requires a `name` param", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_create')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('name')
  })

  it("'gsuite_email_label_update' requires labelId + name", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_update')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('labelId')
    expect(shapeOf(c?.config.inputSchema)).toHaveProperty('name')
  })

  it("'gsuite_email_label_delete' requires labelId", () => {
    const c = calls.find((c) => c.name === 'gsuite_email_label_delete')
    // schema is a ZodObject (.strict()); fields live on .shape
    expect((c?.config.inputSchema as { shape: Record<string, unknown> }).shape).toHaveProperty('labelId')
  })
})

describe('registerMessageTools', () => {
  let server: McpServer
  let calls: RegistrationCall[]

  beforeEach(() => {
    ;({ server, calls } = makeMockServer())
    registerMessageTools(server, cfg)
  })

  it('registers the ten message tools (five core + four sugar + batch_modify)', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_message_archive',
      'gsuite_email_message_get',
      'gsuite_email_message_label',
      'gsuite_email_message_mark_read',
      'gsuite_email_message_mark_unread',
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
    // schema is a ZodObject (.strict()); fields live on .shape
    const shape = (c?.config.inputSchema as { shape: Record<string, unknown> }).shape
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

  it('registers the five draft tools', () => {
    expect(calls.map((c) => c.name).sort()).toEqual([
      'gsuite_email_draft_create',
      'gsuite_email_draft_delete',
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

describe('combined registration (matches the brief)', () => {
  it('the six register*Tools functions together expose exactly the 32 tools, with no send_* tool', () => {
    const { server, calls } = makeMockServer()
    registerAuthTools(server, cfg)
    registerLabelTools(server, cfg)
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
      'gsuite_email_draft_get',
      'gsuite_email_draft_update',
      'gsuite_email_drafts_list',
      'gsuite_email_label_create',
      'gsuite_email_label_delete',
      'gsuite_email_label_update',
      'gsuite_email_labels_list',
      'gsuite_email_message_archive',
      'gsuite_email_message_get',
      'gsuite_email_message_label',
      'gsuite_email_message_mark_read',
      'gsuite_email_message_mark_unread',
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
