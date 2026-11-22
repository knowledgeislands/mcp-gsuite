import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const { guardWrite, listProtected, queryLabelTerms, readProtectedFile } = await import('./index.js')
const messages = await import('../messages/index.js')
const threads = await import('../threads/index.js')
const labels = await import('../labels/index.js')
const filters = await import('../filters/index.js')

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// A fake mailbox: Z_ARCHIVE with two levels beneath it, a look-alike sibling
// that is not beneath it, and ordinary labels.
const LABELS = [
  { id: 'INBOX', name: 'INBOX' },
  { id: 'UNREAD', name: 'UNREAD' },
  { id: 'TRASH', name: 'TRASH' },
  { id: 'Label_Z', name: 'Z_ARCHIVE' },
  { id: 'Label_ZL', name: 'Z_ARCHIVE/Legal Matters' },
  { id: 'Label_ZLD', name: 'Z_ARCHIVE/Legal Matters/2024' },
  { id: 'Label_ZX', name: 'Z_ARCHIVEX' },
  { id: 'Label_D', name: 'Delete' }
]

const MESSAGE_LABELS: Record<string, string[]> = {
  'm-free': ['INBOX', 'Label_D'],
  'm-free2': ['Label_ZX'],
  'm-top': ['Label_Z'],
  'm-sub': ['INBOX', 'Label_ZLD']
}

const THREAD_LABELS: Record<string, string[][]> = {
  't-free': [['INBOX'], ['Label_D']],
  't-prot': [['INBOX'], ['Label_ZL']]
}

const makeGmail = (labelList: Array<{ id?: string; name?: string }> = LABELS) => ({
  users: {
    labels: {
      list: vi.fn().mockResolvedValue({ data: { labels: labelList } }),
      create: vi.fn().mockResolvedValue({ data: { id: 'Label_new', name: 'new' } }),
      patch: vi.fn().mockResolvedValue({ data: { id: 'Label_D', name: 'renamed' } }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: { id: 'Label_D', name: 'Delete', type: 'user' } })
    },
    messages: {
      get: vi.fn(({ id }: { id: string }) => Promise.resolve({ data: { id, labelIds: MESSAGE_LABELS[id] } })),
      modify: vi.fn(({ id }: { id: string }) => Promise.resolve({ data: { id, labelIds: [] } })),
      trash: vi.fn(({ id }: { id: string }) => Promise.resolve({ data: { id, labelIds: ['TRASH'] } })),
      batchModify: vi.fn().mockResolvedValue({ data: {} })
    },
    threads: {
      get: vi.fn(({ id }: { id: string }) =>
        Promise.resolve({
          data: { id, messages: id === 't-bare' ? [{}] : THREAD_LABELS[id]?.map((labelIds) => ({ labelIds })) }
        })
      ),
      modify: vi.fn(({ id }: { id: string }) => Promise.resolve({ data: { id, messages: [] } })),
      trash: vi.fn(({ id }: { id: string }) => Promise.resolve({ data: { id, messages: [] } }))
    },
    settings: {
      filters: {
        list: vi.fn().mockResolvedValue({ data: { filter: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'f-new' } }),
        get: vi.fn(),
        delete: vi.fn().mockResolvedValue({ data: {} })
      }
    }
  }
})

type FakeGmail = ReturnType<typeof makeGmail>

let dir: string
let gmail: FakeGmail

const writeList = (body: string) => {
  const file = path.join(dir, 'kb-mcp-gsuite.toml')
  fs.writeFileSync(file, body)
  return file
}

const Z_ARCHIVE = `version = 1
enforce = true

[[protected]]
kind = "label"
id = "Label_Z"
name = "Z_ARCHIVE"
subtree = true
reason = "Z-ARCHIVE, Kris, 6 November 2026"
`

const cfgWith = (protectedFile: string | null) =>
  ({ auth: {}, defaultSearchResults: 20, downloadPath: os.tmpdir(), protectedFile }) as unknown as Config

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsuite-protected-'))
  gmail = makeGmail()
  gmailServiceMock.mockReset()
  gmailServiceMock.mockReturnValue(gmail)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

type ToolResult = { isError?: boolean; structuredContent?: Record<string, unknown> }

const expectRefused = (res: unknown, targets: string[]) => {
  const r = res as ToolResult
  expect(r.isError).toBe(true)
  expect(r.structuredContent?.code).toBe('PROTECTED_REFUSED')
  expect(r.structuredContent?.targets).toEqual(targets)
  expect(r.structuredContent?.entry).toEqual({ kind: 'label', id: 'Label_Z', name: 'Z_ARCHIVE' })
}

const expectWritesUntouched = () => {
  expect(gmail.users.messages.modify).not.toHaveBeenCalled()
  expect(gmail.users.messages.trash).not.toHaveBeenCalled()
  expect(gmail.users.messages.batchModify).not.toHaveBeenCalled()
  expect(gmail.users.threads.modify).not.toHaveBeenCalled()
  expect(gmail.users.threads.trash).not.toHaveBeenCalled()
  expect(gmail.users.labels.create).not.toHaveBeenCalled()
  expect(gmail.users.labels.patch).not.toHaveBeenCalled()
  expect(gmail.users.labels.delete).not.toHaveBeenCalled()
  expect(gmail.users.settings.filters.create).not.toHaveBeenCalled()
  expect(gmail.users.settings.filters.delete).not.toHaveBeenCalled()
}

describe('readProtectedFile', () => {
  it('is absent with no configured file, or a file that does not exist', () => {
    expect(readProtectedFile(null)).toEqual({ status: 'absent', source: null })
    const missing = path.join(dir, 'missing.toml')
    expect(readProtectedFile(missing)).toEqual({ status: 'absent', source: missing })
  })

  it('is invalid when the path cannot be read', () => {
    const state = readProtectedFile(dir)
    expect(state).toMatchObject({ status: 'invalid', source: dir })
    expect((state as { error: string }).error).toMatch(/cannot read the file/)
  })

  it('is invalid when the TOML does not parse', () => {
    const state = readProtectedFile(writeList('version = = 1'))
    expect((state as { error: string }).error).toMatch(/not valid TOML/)
  })

  it.each([
    ['an unknown version', 'version = 2\n', /version/],
    ['an unknown top-level key', 'version = 1\nenforced = true\n', /\(root\)/],
    ['a Microsoft 365 kind', 'version = 1\n[[protected]]\nkind = "folder"\nid = "x"\n', /protected\.0\.kind/],
    ['an entry without an id', 'version = 1\n[[protected]]\nkind = "label"\n', /protected\.0\.id/],
    ['an unknown entry key', 'version = 1\n[[protected]]\nkind = "label"\nid = "x"\nsubtrees = true\n', /protected\.0/]
  ])('is invalid for %s', (_label, body, pattern) => {
    const state = readProtectedFile(writeList(body))
    expect(state.status).toBe('invalid')
    expect((state as { error: string }).error).toMatch(pattern)
  })

  it('defaults enforce and subtree to true', () => {
    const state = readProtectedFile(writeList('version = 1\n[[protected]]\nkind = "label"\nid = "Label_Z"\n'))
    expect(state).toMatchObject({ status: 'enforced', entries: [{ id: 'Label_Z', subtree: true }] })
  })

  it('is disabled when the file says enforce = false', () => {
    const state = readProtectedFile(writeList(Z_ARCHIVE.replace('enforce = true', 'enforce = false')))
    expect(state).toMatchObject({ status: 'disabled', entries: [{ id: 'Label_Z' }] })
  })
})

describe('queryLabelTerms', () => {
  it('finds label: and in: terms, quoted, bare, negated or grouped', () => {
    expect(
      queryLabelTerms('label:"Z_ARCHIVE/Legal Matters" from:x -label:Delete {in:Z_ARCHIVE label:a} (LABEL:b)')
    ).toEqual(['Z_ARCHIVE/Legal Matters', 'Delete', 'Z_ARCHIVE', 'a', 'b'])
    expect(queryLabelTerms('subject:label from:me')).toEqual([])
  })
})

describe('listProtected', () => {
  const now = () => new Date('2026-11-22T22:30:00Z')

  it('reports not enforced, with no Gmail call, when there is no file', async () => {
    const res = await listProtected(cfgWith(null), now)
    expect(res.structuredContent).toEqual({
      enforced: false,
      source: null,
      entries: [],
      checked_at: '2026-11-22T22:30:00.000Z'
    })
    expect(gmailServiceMock).not.toHaveBeenCalled()
  })

  it('lists the entries but reports not enforced when enforce = false', async () => {
    const file = writeList(Z_ARCHIVE.replace('enforce = true', 'enforce = false'))
    const res = await listProtected(cfgWith(file), now)
    expect(res.structuredContent).toMatchObject({
      enforced: false,
      source: file,
      entries: [{ kind: 'label', id: 'Label_Z', name: 'Z_ARCHIVE', current_name: null, covers: [] }]
    })
    expect(res.structuredContent).not.toHaveProperty('error')
  })

  it('resolves covers afresh by name beneath the entry, and not a look-alike sibling', async () => {
    const file = writeList(Z_ARCHIVE)
    const res = await listProtected(cfgWith(file), now)
    expect(res.structuredContent).toEqual({
      enforced: true,
      source: file,
      entries: [
        {
          kind: 'label',
          id: 'Label_Z',
          name: 'Z_ARCHIVE',
          current_name: 'Z_ARCHIVE',
          subtree: true,
          reason: 'Z-ARCHIVE, Kris, 6 November 2026',
          covers: [
            { id: 'Label_ZL', name: 'Z_ARCHIVE/Legal Matters' },
            { id: 'Label_ZLD', name: 'Z_ARCHIVE/Legal Matters/2024' }
          ]
        }
      ],
      checked_at: '2026-11-22T22:30:00.000Z'
    })
  })

  it('follows the entry by id after a rename', async () => {
    gmail = makeGmail([
      { id: 'Label_Z', name: 'Old Archive' },
      { id: 'Label_ZL', name: 'Old Archive/Legal Matters' },
      { id: 'Label_X', name: 'Z_ARCHIVE/Stray' },
      {}
    ])
    gmailServiceMock.mockReturnValue(gmail)
    const res = await listProtected(cfgWith(writeList(Z_ARCHIVE)))
    expect(res.structuredContent).toMatchObject({
      enforced: true,
      entries: [
        {
          name: 'Z_ARCHIVE',
          current_name: 'Old Archive',
          covers: [{ id: 'Label_ZL', name: 'Old Archive/Legal Matters' }]
        }
      ]
    })
  })

  it('takes the current name when the file gives none, and covers nothing without subtree', async () => {
    const file = writeList('version = 1\n[[protected]]\nkind = "label"\nid = "Label_Z"\nsubtree = false\n')
    const res = await listProtected(cfgWith(file), now)
    expect(res.structuredContent).toMatchObject({
      enforced: true,
      entries: [{ name: 'Z_ARCHIVE', current_name: 'Z_ARCHIVE', subtree: false, covers: [] }]
    })
  })

  it('fails closed when an entry id no longer resolves', async () => {
    const file = writeList(`${Z_ARCHIVE}\n[[protected]]\nkind = "label"\nid = "Label_gone"\n`)
    const res = await listProtected(cfgWith(file), now)
    expect(res.structuredContent).toMatchObject({
      enforced: false,
      error: 'entries no longer resolve to a label: Label_gone',
      entries: [
        { id: 'Label_Z', name: 'Z_ARCHIVE' },
        { id: 'Label_gone', name: '' }
      ]
    })
  })

  it('names the file entry when an unresolved id carries a name', async () => {
    gmail = makeGmail([])
    gmailServiceMock.mockReturnValue(gmail)
    const res = await listProtected(cfgWith(writeList(Z_ARCHIVE)), now)
    expect(res.structuredContent?.error).toBe('entries no longer resolve to a label: Label_Z (Z_ARCHIVE)')
  })

  it('tolerates a mailbox that returns no label array', async () => {
    gmail.users.labels.list.mockResolvedValue({ data: {} })
    const res = await listProtected(cfgWith(writeList(Z_ARCHIVE)), now)
    expect(res.structuredContent).toMatchObject({ enforced: false })
  })

  it('reports an unusable file with its error and no entries', async () => {
    const file = writeList('version = 2\n')
    const res = await listProtected(cfgWith(file), now)
    expect(res.structuredContent).toMatchObject({ enforced: false, source: file, entries: [] })
    expect(res.structuredContent?.error).toMatch(/not a valid protected list/)
  })

  it('reports not enforced when Gmail cannot be read', async () => {
    gmail.users.labels.list.mockRejectedValue(new Error('quota'))
    const file = writeList(Z_ARCHIVE)
    const res = await listProtected(cfgWith(file))
    expect(res.structuredContent).toMatchObject({
      enforced: false,
      source: file,
      error: 'could not resolve the list: quota',
      entries: []
    })
  })

  it('reports a null source when Gmail fails with no file configured', async () => {
    const res = await listProtected({ auth: {} } as unknown as Config)
    expect(res.structuredContent).toMatchObject({ enforced: false, source: null })
  })
})

describe('guardWrite', () => {
  it('lets every write through, with no lookup, when there is no file', async () => {
    expect(await guardWrite(cfgWith(null), 'x', { messageIds: ['m-top'], labelIds: ['Label_Z'] })).toBeNull()
    expect(gmailServiceMock).not.toHaveBeenCalled()
  })

  it('lets every write through when the file says enforce = false', async () => {
    const file = writeList(Z_ARCHIVE.replace('enforce = true', 'enforce = false'))
    expect(await guardWrite(cfgWith(file), 'x', { messageIds: ['m-top'] })).toBeNull()
    expect(gmailServiceMock).not.toHaveBeenCalled()
  })

  it('treats a configured file that does not exist as no file', async () => {
    expect(await guardWrite(cfgWith(path.join(dir, 'none.toml')), 'x', { messageIds: ['m-top'] })).toBeNull()
  })

  it('blocks every guarded write, naming the error, when the file is unusable', async () => {
    const file = writeList('not toml at all [')
    const res = (await guardWrite(cfgWith(file), 'gsuite_email_message_label', {
      messageIds: ['m-free']
    })) as ToolResult & { content: Array<{ text: string }> }
    expect(res.isError).toBe(true)
    expect(res.structuredContent).toMatchObject({
      code: 'PROTECTED_LIST_INVALID',
      tool: 'gsuite_email_message_label',
      source: file
    })
    expect(res.content[0]?.text).toMatch(/PROTECTED_LIST_INVALID/)
    expect(gmail.users.messages.get).not.toHaveBeenCalled()
  })

  it('passes a write whose targets are all unprotected', async () => {
    const cfg = cfgWith(writeList(Z_ARCHIVE))
    expect(
      await guardWrite(cfg, 'x', {
        messageIds: ['m-free', 'm-free2', 'm-none'],
        threadIds: ['t-free', 't-none', 't-bare'],
        labelIds: ['Label_D', 'Label_ZX'],
        labelNames: ['Z_ARCHIVEX/New', 'Elsewhere/Z_ARCHIVE'],
        queries: ['label:Delete -in:inbox']
      })
    ).toBeNull()
  })

  it('refuses the whole call, naming every protected target and entry once', async () => {
    const file = writeList(
      `${Z_ARCHIVE}\n[[protected]]\nkind = "label"\nid = "Label_D"\nname = "Delete"\nsubtree = false\n`
    )
    const res = (await guardWrite(cfgWith(file), 'gsuite_email_messages_batch_modify', {
      messageIds: ['m-free2', 'm-top', 'm-sub', 'm-top'],
      labelIds: ['Label_ZL', 'Label_D']
    })) as ToolResult & { content: Array<{ text: string }> }
    expect(res.structuredContent).toEqual({
      code: 'PROTECTED_REFUSED',
      tool: 'gsuite_email_messages_batch_modify',
      entry: { kind: 'label', id: 'Label_Z', name: 'Z_ARCHIVE' },
      entries: [
        { kind: 'label', id: 'Label_Z', name: 'Z_ARCHIVE' },
        { kind: 'label', id: 'Label_D', name: 'Delete' }
      ],
      targets: ['Label_ZL', 'Label_D', 'm-top', 'm-sub']
    })
    expect(res.content[0]?.text).toMatch(/^Error gsuite_email_messages_batch_modify: PROTECTED_REFUSED: 4 target/)
  })

  it('attributes a label covered by two overlapping entries to the first', async () => {
    const file = writeList(`${Z_ARCHIVE}\n[[protected]]\nkind = "label"\nid = "Label_ZL"\nname = "Legal"\n`)
    expectRefused(await guardWrite(cfgWith(file), 'x', { labelIds: ['Label_ZLD', 'Label_ZL'] }), [
      'Label_ZLD',
      'Label_ZL'
    ])
  })

  it('refuses names in or beneath a protected label, case-insensitively', async () => {
    const cfg = cfgWith(writeList(Z_ARCHIVE))
    expectRefused(await guardWrite(cfg, 'x', { labelNames: ['z_archive/New'] }), ['z_archive/New'])
    expectRefused(await guardWrite(cfg, 'x', { labelNames: ['Z_ARCHIVE'] }), ['Z_ARCHIVE'])
    expectRefused(await guardWrite(cfg, 'x', { labelNames: ['Z_ARCHIVE/Legal Matters/2025'] }), [
      'Z_ARCHIVE/Legal Matters/2025'
    ])
  })

  it('refuses a query that names a protected label in any spelling Gmail accepts', async () => {
    const cfg = cfgWith(writeList(Z_ARCHIVE))
    expectRefused(await guardWrite(cfg, 'x', { queries: ['from:a -label:z_archive-legal-matters'] }), [
      'label:z_archive-legal-matters'
    ])
    expectRefused(await guardWrite(cfg, 'x', { queries: ['label:"Z_ARCHIVE/Legal Matters"'] }), [
      'label:Z_ARCHIVE/Legal Matters'
    ])
    expectRefused(await guardWrite(cfg, 'x', { queries: ['in:Z_ARCHIVE'] }), ['label:Z_ARCHIVE'])
  })

  it('refuses a thread when any of its messages carries a protected label', async () => {
    const cfg = cfgWith(writeList(Z_ARCHIVE))
    expectRefused(await guardWrite(cfg, 'x', { threadIds: ['t-free', 't-prot'] }), ['t-prot'])
  })

  it('does not write when a target lookup fails', async () => {
    gmail.users.messages.get.mockRejectedValueOnce(new Error('not found'))
    await expect(guardWrite(cfgWith(writeList(Z_ARCHIVE)), 'x', { messageIds: ['m-x'] })).rejects.toThrow('not found')
  })
})

// Every write tool, end to end through its handler: refused on the entry itself,
// on a sub-label, after the entry is renamed, and (for batches) on a mixed set.
describe('write tools refuse protected targets', () => {
  const renamed = () => {
    gmail = makeGmail([
      ...LABELS.filter((l) => !l.id.startsWith('Label_Z')),
      { id: 'Label_Z', name: 'Kept' },
      { id: 'Label_ZL', name: 'Kept/Legal Matters' },
      { id: 'Label_ZLD', name: 'Kept/Legal Matters/2024' }
    ])
    gmailServiceMock.mockReturnValue(gmail)
  }

  const messageTools: Array<[string, (cfg: Config, id: string) => Promise<unknown>]> = [
    ['label', (cfg, messageId) => messages.labelMessage(cfg, { messageId, labelIds: ['Label_D'] })],
    ['unlabel', (cfg, messageId) => messages.unlabelMessage(cfg, { messageId, labelIds: ['Label_D'] })],
    ['modify', (cfg, messageId) => messages.messageModify(cfg, { messageId, addLabelIds: ['Label_D'] })],
    ['mark_read', (cfg, messageId) => messages.messageMarkRead(cfg, { messageId })],
    ['mark_unread', (cfg, messageId) => messages.messageMarkUnread(cfg, { messageId })],
    ['archive', (cfg, messageId) => messages.messageArchive(cfg, { messageId })],
    ['trash', (cfg, messageId) => messages.messageTrash(cfg, { messageId })],
    ['batch_modify', (cfg, id) => messages.messageBatchModify(cfg, { messageIds: [id], addLabelIds: ['Label_D'] })]
  ]

  describe.each(messageTools)('gsuite_email_message %s', (_name, call) => {
    it('refuses a message carrying the entry label', async () => {
      expectRefused(await call(cfgWith(writeList(Z_ARCHIVE)), 'm-top'), ['m-top'])
      expectWritesUntouched()
    })

    it('refuses a message carrying a sub-label', async () => {
      expectRefused(await call(cfgWith(writeList(Z_ARCHIVE)), 'm-sub'), ['m-sub'])
      expectWritesUntouched()
    })

    it('still refuses after the entry is renamed', async () => {
      renamed()
      expectRefused(await call(cfgWith(writeList(Z_ARCHIVE)), 'm-sub'), ['m-sub'])
      expectWritesUntouched()
    })

    it('lets an unprotected message through', async () => {
      const res = (await call(cfgWith(writeList(Z_ARCHIVE)), 'm-free')) as ToolResult
      expect(res.isError).toBeUndefined()
    })
  })

  const threadTools: Array<[string, (cfg: Config, id: string) => Promise<unknown>]> = [
    ['label', (cfg, threadId) => threads.labelThread(cfg, { threadId, labelIds: ['Label_D'] })],
    ['unlabel', (cfg, threadId) => threads.unlabelThread(cfg, { threadId, labelIds: ['Label_D'] })],
    ['mark_read', (cfg, threadId) => threads.threadMarkRead(cfg, { threadId })],
    ['mark_unread', (cfg, threadId) => threads.threadMarkUnread(cfg, { threadId })],
    ['archive', (cfg, threadId) => threads.threadArchive(cfg, { threadId })],
    ['trash', (cfg, threadId) => threads.threadTrash(cfg, { threadId })]
  ]

  describe.each(threadTools)('gsuite_email_thread %s', (_name, call) => {
    it('refuses a thread with a message under the entry', async () => {
      expectRefused(await call(cfgWith(writeList(Z_ARCHIVE)), 't-prot'), ['t-prot'])
      expectWritesUntouched()
    })

    it('still refuses after the entry is renamed', async () => {
      renamed()
      expectRefused(await call(cfgWith(writeList(Z_ARCHIVE)), 't-prot'), ['t-prot'])
      expectWritesUntouched()
    })

    it('lets an unprotected thread through', async () => {
      const res = (await call(cfgWith(writeList(Z_ARCHIVE)), 't-free')) as ToolResult
      expect(res.isError).toBeUndefined()
    })
  })

  it('refuses adding or removing a protected label on an unprotected message', async () => {
    const cfg = cfgWith(writeList(Z_ARCHIVE))
    expectRefused(await messages.labelMessage(cfg, { messageId: 'm-free', labelIds: ['Label_ZLD'] }), ['Label_ZLD'])
    expectRefused(await messages.messageModify(cfg, { messageId: 'm-free', removeLabelIds: ['Label_Z'] }), ['Label_Z'])
    expectRefused(await threads.labelThread(cfg, { threadId: 't-free', labelIds: ['Label_ZL'] }), ['Label_ZL'])
    expectWritesUntouched()
  })

  it('refuses a mixed batch whole, naming every protected message', async () => {
    const res = await messages.messageBatchModify(cfgWith(writeList(Z_ARCHIVE)), {
      messageIds: ['m-free', 'm-top', 'm-free2', 'm-sub'],
      addLabelIds: ['Label_D']
    })
    expectRefused(res, ['m-top', 'm-sub'])
    expectWritesUntouched()
  })

  it('reports a lookup failure as an ordinary error and writes nothing', async () => {
    gmail.users.messages.get.mockRejectedValueOnce(new Error('boom'))
    const res = (await messages.messageTrash(cfgWith(writeList(Z_ARCHIVE)), { messageId: 'm-free' })) as ToolResult
    expect(res.isError).toBe(true)
    expectWritesUntouched()
  })

  it('blocks message writes while the file is unusable', async () => {
    const res = (await messages.messageArchive(cfgWith(writeList('version = 1\nprotected = 3\n')), {
      messageId: 'm-free'
    })) as ToolResult
    expect(res.structuredContent?.code).toBe('PROTECTED_LIST_INVALID')
    expectWritesUntouched()
  })

  describe('labels', () => {
    it('refuses creating a label beneath a protected one, after a rename too', async () => {
      expectRefused(await labels.createLabel(cfgWith(writeList(Z_ARCHIVE)), { name: 'Z_ARCHIVE/New' }), [
        'Z_ARCHIVE/New'
      ])
      renamed()
      expectRefused(await labels.createLabel(cfgWith(writeList(Z_ARCHIVE)), { name: 'Kept/Legal Matters/New' }), [
        'Kept/Legal Matters/New'
      ])
      expectWritesUntouched()
    })

    it('refuses renaming the entry, a sub-label, or another label into the subtree', async () => {
      const cfg = cfgWith(writeList(Z_ARCHIVE))
      expectRefused(await labels.updateLabel(cfg, { labelId: 'Label_Z', name: 'Other' }), ['Label_Z'])
      expectRefused(await labels.updateLabel(cfg, { labelId: 'Label_ZLD', name: 'Other' }), ['Label_ZLD'])
      expectRefused(await labels.updateLabel(cfg, { labelId: 'Label_D', name: 'Z_ARCHIVE/Delete' }), [
        'Z_ARCHIVE/Delete'
      ])
      expectWritesUntouched()
    })

    it('refuses deleting a protected label, in preview as well', async () => {
      const cfg = cfgWith(writeList(Z_ARCHIVE))
      expectRefused(await labels.deleteLabel(cfg, { labelId: 'Label_ZL', dry_run: false }), ['Label_ZL'])
      expectRefused(await labels.deleteLabel(cfg, { labelId: 'Label_Z', dry_run: true }), ['Label_Z'])
      expect(gmail.users.labels.get).not.toHaveBeenCalled()
      expectWritesUntouched()
    })

    it('lets unprotected label changes through', async () => {
      const cfg = cfgWith(writeList(Z_ARCHIVE))
      expect(((await labels.createLabel(cfg, { name: 'Z_ARCHIVEX/New' })) as ToolResult).isError).toBeUndefined()
      expect(
        ((await labels.updateLabel(cfg, { labelId: 'Label_D', name: 'Bin' })) as ToolResult).isError
      ).toBeUndefined()
      expect(
        ((await labels.deleteLabel(cfg, { labelId: 'Label_D', dry_run: false })) as ToolResult).isError
      ).toBeUndefined()
    })
  })

  describe('filters', () => {
    const base = { criteria: { from: 'a@example.com' }, action: { skipInbox: false, markRead: false } }

    it('refuses a filter that files into a protected label', async () => {
      const res = await filters.createFilter(cfgWith(writeList(Z_ARCHIVE)), {
        ...base,
        action: { addLabelId: 'Label_ZL', skipInbox: true, markRead: false },
        dry_run: false
      })
      expectRefused(res, ['Label_ZL'])
      expectWritesUntouched()
    })

    it('refuses a filter whose query or negated query names a protected label, in preview too', async () => {
      const cfg = cfgWith(writeList(Z_ARCHIVE))
      expectRefused(
        await filters.createFilter(cfg, {
          criteria: { query: 'label:z_archive' },
          action: { addLabelId: 'Label_D', skipInbox: false, markRead: false },
          dry_run: true
        }),
        ['label:z_archive']
      )
      expectRefused(
        await filters.createFilter(cfg, {
          criteria: { from: 'x@example.com', negatedQuery: 'label:"Z_ARCHIVE/Legal Matters"' },
          action: { skipInbox: true, markRead: false },
          dry_run: false
        }),
        ['label:Z_ARCHIVE/Legal Matters']
      )
      expectWritesUntouched()
    })

    it('refuses deleting a filter that acts on a protected label', async () => {
      gmail.users.settings.filters.get.mockResolvedValue({
        data: { id: 'f1', criteria: { from: 'a' }, action: { addLabelIds: ['Label_ZLD'] } }
      })
      expectRefused(await filters.deleteFilter(cfgWith(writeList(Z_ARCHIVE)), { filterId: 'f1', dry_run: false }), [
        'Label_ZLD'
      ])
      gmail.users.settings.filters.get.mockResolvedValue({
        data: {
          id: 'f2',
          criteria: { query: 'in:Z_ARCHIVE', negatedQuery: 'x' },
          action: { removeLabelIds: ['INBOX'] }
        }
      })
      expectRefused(await filters.deleteFilter(cfgWith(writeList(Z_ARCHIVE)), { filterId: 'f2', dry_run: false }), [
        'label:Z_ARCHIVE'
      ])
      expectWritesUntouched()
    })

    it('lets unprotected filter changes through', async () => {
      const cfg = cfgWith(writeList(Z_ARCHIVE))
      gmail.users.settings.filters.get.mockResolvedValue({ data: { id: 'f3' } })
      expect(
        ((await filters.deleteFilter(cfg, { filterId: 'f3', dry_run: false })) as ToolResult).isError
      ).toBeUndefined()
      expect(gmail.users.settings.filters.delete).toHaveBeenCalledTimes(1)
      const created = await filters.createFilter(cfg, {
        ...base,
        action: { addLabelId: 'Label_D', skipInbox: false, markRead: true },
        dry_run: false
      })
      expect((created as ToolResult).isError).toBeUndefined()
    })
  })
})
