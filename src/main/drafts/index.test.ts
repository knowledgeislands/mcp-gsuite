import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const { _resetAuthEmailCacheForTests, createDraft, deleteDraft, getDraft, listDrafts, updateDraft } = await import('./index.js')

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// Draft attachments are read off disk confined to `cfg.downloadPath` (the same
// root the WRITE side writes into). Tests use a real temp root with real files
// so the realpath layer of the path guard resolves; `cfg` is rebuilt per test
// to point at it. Only the slices these handlers read need to be present.
let downloadRoot: string
let cfg: Config

beforeEach(() => {
  downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-draft-attach-'))
  cfg = { auth: {}, defaultSearchResults: 20, downloadPath: downloadRoot } as unknown as Config
})

afterEach(() => {
  fs.rmSync(downloadRoot, { recursive: true, force: true })
})

// Write a real attachment file inside the download root and return its absolute
// path so the path-containment guard accepts it.
const writeAttachment = (name: string, contents: string | Buffer): string => {
  const p = path.join(downloadRoot, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, contents)
  return p
}

// DraftInput-shaped args; bind cfg so the existing call sites stay unchanged.
type DraftArgs = Parameters<typeof createDraft>[1]
const handleCreateDraft = (args: DraftArgs) => createDraft(cfg, args)
const handleUpdateDraft = (args: Parameters<typeof updateDraft>[1]) => updateDraft(cfg, args)
const handleListDrafts = (args: Parameters<typeof listDrafts>[1]) => listDrafts(cfg, args)
const handleGetDraft = (args: Parameters<typeof getDraft>[1]) => getDraft(cfg, args)
const handleDeleteDraft = (args: Parameters<typeof deleteDraft>[1]) => deleteDraft(cfg, args)

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')

const makeGmail = () => ({
  users: {
    drafts: {
      create: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
    },
    messages: {
      get: vi.fn()
    },
    getProfile: vi.fn()
  }
})

beforeEach(() => {
  gmailServiceMock.mockReset()
  _resetAuthEmailCacheForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Decode the base64url `raw` field a draft was created with so tests can assert on the RFC 2822 contents.
const decodeRaw = (call: { requestBody: { message: { raw: string } } } | undefined): string =>
  call ? Buffer.from(call.requestBody.message.raw, 'base64url').toString('utf8') : ''

describe('handleCreateDraft', () => {
  it('creates a plain-text draft with To, Subject, and bodyText', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 't1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ to: ['x@y.com'], subject: 'Hello', bodyText: 'Body content' })
    expect(JSON.parse(r.content[0].text)).toEqual({ draftId: 'd1', messageId: 'm1', threadId: 't1' })

    const call = (gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.userId).toBe('me')
    expect(call.requestBody.message.threadId).toBeUndefined()
    const raw = decodeRaw(call)
    expect(raw).toContain('To: x@y.com\r\n')
    expect(raw).toContain('Subject: Hello\r\n')
    expect(raw).toContain('Body content')
  })

  it('attaches files from disk, inferring filename and mimeType', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 't1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const docPath = writeAttachment('doc.pdf', Buffer.from('PDF-BYTES'))

    await handleCreateDraft({
      to: ['x@y.com'],
      subject: 'With attach',
      bodyText: 'see attached',
      attachments: [docPath]
    })

    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Content-Type: multipart/mixed;')
    expect(raw).toContain('Content-Type: application/pdf\r\n')
    expect(raw).toContain('filename="doc.pdf"')
    expect(raw).toContain(Buffer.from('PDF-BYTES').toString('base64'))
  })

  it('attachment overrides: object form lets the caller rename the attachment', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)
    const internalPath = writeAttachment('internal-name.pdf', Buffer.from('PDF'))

    await handleCreateDraft({
      to: ['x@y.com'],
      bodyText: 'b',
      attachments: [{ path: internalPath, filename: 'invoice-2026-q1.pdf' }]
    })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('filename="invoice-2026-q1.pdf"')
    // The on-disk basename must NOT leak through when overridden.
    expect(raw).not.toContain('internal-name.pdf')
    // mimeType still inferred from the *original path's* extension.
    expect(raw).toContain('Content-Type: application/pdf\r\n')
  })

  it('attachment overrides: object form lets the caller override the mimeType', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)
    const exportPath = writeAttachment('export.bin', Buffer.from('payload'))

    await handleCreateDraft({
      to: ['x@y.com'],
      bodyText: 'b',
      // .bin would default to application/octet-stream — override to text/csv.
      attachments: [{ path: exportPath, mimeType: 'text/csv' }]
    })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Content-Type: text/csv\r\n')
    // Filename still derived from the path basename since not overridden.
    expect(raw).toContain('filename="export.bin"')
  })

  it('attachment overrides: object form can override both filename and mimeType simultaneously', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)
    const datPath = writeAttachment('tmpfile.dat', Buffer.from('csv-bytes'))

    await handleCreateDraft({
      to: ['x@y.com'],
      bodyText: 'b',
      attachments: [{ path: datPath, filename: 'q1-report.csv', mimeType: 'text/csv' }]
    })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('filename="q1-report.csv"')
    expect(raw).toContain('Content-Type: text/csv\r\n')
  })

  it('attachment overrides: string and object forms mix freely in the same array', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)
    const plainPath = writeAttachment('plain.pdf', Buffer.from('plain-bytes'))
    const rawPath = writeAttachment('raw.bin', Buffer.from('raw-bytes'))

    await handleCreateDraft({
      to: ['x@y.com'],
      bodyText: 'b',
      attachments: [plainPath, { path: rawPath, filename: 'renamed.txt', mimeType: 'text/plain' }]
    })

    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('filename="plain.pdf"')
    expect(raw).toContain('filename="renamed.txt"')
    expect(raw).toContain('Content-Type: text/plain\r\n')
    // Both files' bytes made it into the payload.
    expect(raw).toContain(Buffer.from('plain-bytes').toString('base64'))
    expect(raw).toContain(Buffer.from('raw-bytes').toString('base64'))
  })

  it('threads a reply via replyToMessageId — pulls In-Reply-To, References, threadId, Re: subject from the original', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'origMsg',
        threadId: 'origThread',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig@gmail.com>' },
            { name: 'References', value: '<a@gmail.com> <b@gmail.com>' },
            { name: 'Subject', value: 'Original topic' }
          ]
        }
      }
    })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'mNew', threadId: 'origThread' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({
      to: ['x@y.com'],
      bodyText: 'my reply',
      replyToMessageId: 'origMsg'
    })

    const call = (gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.requestBody.message.threadId).toBe('origThread')
    const raw = decodeRaw(call)
    expect(raw).toContain('In-Reply-To: <orig@gmail.com>\r\n')
    expect(raw).toContain('References: <a@gmail.com> <b@gmail.com> <orig@gmail.com>\r\n')
    expect(raw).toContain('Subject: Re: Original topic\r\n')
  })

  it("doesn't double-prefix 'Re:' if the original Subject already has one", async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'origMsg', threadId: 't1', payload: { headers: [{ name: 'Subject', value: 'Re: still going' }] } }
    })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', replyToMessageId: 'origMsg' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Subject: Re: still going\r\n')
    expect(raw).not.toContain('Re: Re:')
  })

  it('respects an explicit subject even when replyToMessageId is set', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'origMsg',
        threadId: 't1',
        payload: {
          headers: [
            { name: 'Subject', value: 'Original' },
            { name: 'Message-ID', value: '<o@x>' }
          ]
        }
      }
    })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], subject: 'Custom override', bodyText: 'b', replyToMessageId: 'origMsg' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Subject: Custom override\r\n')
  })

  it('handles a replyToMessageId where the original has no threadId either (threadId falls back to undefined)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'origMsg',
        payload: {
          headers: [
            { name: 'Subject', value: 'No thread id' },
            { name: 'Message-ID', value: '<orig@x>' }
          ]
        }
      }
    })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', replyToMessageId: 'origMsg' })
    const call = (gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.requestBody.message.threadId).toBeUndefined()
  })

  it('handles a replyToMessageId where the original has no Message-ID and no References', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'origMsg', threadId: 't1', payload: { headers: [{ name: 'Subject', value: 'No id' }] } }
    })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', replyToMessageId: 'origMsg' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).not.toContain('In-Reply-To:')
    expect(raw).not.toContain('References:')
    expect(raw).toContain('Subject: Re: No id\r\n')
  })

  it('returns empty strings when the API response omits message fields', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ to: ['x@y.com'], subject: 'S', bodyText: 'b' })
    expect(JSON.parse(r.content[0].text)).toEqual({ draftId: '', messageId: '', threadId: '' })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Bad request' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ to: ['x@y.com'], subject: 'S', bodyText: 'b' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 400: Bad request/)
  })

  it('returns an error when neither `to` nor `replyAll` provides a recipient', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ subject: 'S', bodyText: 'b' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/At least one `to` recipient is required/)
    // Did NOT hit the API — failed before composition completed.
    expect(gmail.users.drafts.create).not.toHaveBeenCalled()
  })
})

// Attachment paths are an arbitrary-host-file-read vector: without containment,
// a caller could exfiltrate any file the server can read as a draft attachment.
// The READ side must enforce the SAME two-layer guard (lexical + realpath)
// against the SAME root (`cfg.downloadPath`) as the WRITE side (`attachment_get`).
describe('handleCreateDraft (attachment path containment)', () => {
  it('attaches a file that lives inside the download root', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'd1', message: {} } })
    gmailServiceMock.mockReturnValue(gmail)
    const inRoot = writeAttachment('reports/q1.pdf', Buffer.from('IN-ROOT-BYTES'))

    const r = await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', attachments: [inRoot] })
    expect(r).not.toHaveProperty('isError', true)
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('filename="q1.pdf"')
    expect(raw).toContain(Buffer.from('IN-ROOT-BYTES').toString('base64'))
  })

  it('rejects an absolute attachment path outside the download root', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)
    // A real file that exists, but outside the configured root.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-outside-'))
    const secret = path.join(outsideDir, 'secret.txt')
    fs.writeFileSync(secret, 'top secret')
    try {
      const r = await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', attachments: [secret] })
      expect(r).toHaveProperty('isError', true)
      expect(r.content[0].text).toMatch(/escapes download root/)
      // Never reached the API — failed during composition.
      expect(gmail.users.drafts.create).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('rejects a "../" traversal that escapes the download root', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', attachments: ['../../etc/passwd'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/escapes download root/)
    expect(gmail.users.drafts.create).not.toHaveBeenCalled()
  })

  it('rejects a symlink inside the root that redirects outside it', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)
    // Target lives outside the root; a symlink inside the root points at it.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-outside-'))
    const secret = path.join(outsideDir, 'secret.txt')
    fs.writeFileSync(secret, 'top secret')
    const link = path.join(downloadRoot, 'escape')
    fs.symlinkSync(outsideDir, link)
    try {
      const r = await handleCreateDraft({ to: ['x@y.com'], bodyText: 'b', attachments: [path.join(link, 'secret.txt')] })
      expect(r).toHaveProperty('isError', true)
      expect(r.content[0].text).toMatch(/escapes root/)
      expect(gmail.users.drafts.create).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('enforces the same guard on updateDraft (shares composeDraft/readAttachments)', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateDraft({ draftId: 'd1', to: ['x@y.com'], bodyText: 'b', attachments: ['../../etc/passwd'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/escapes download root/)
    expect(gmail.users.drafts.update).not.toHaveBeenCalled()
  })
})

describe('handleCreateDraft (HTML body)', () => {
  it('emits a single-part text/html when only bodyHtml is provided', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 't1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], subject: 'S', bodyHtml: '<p>html-only</p>' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Content-Type: text/html; charset=UTF-8\r\n')
    expect(raw).toContain('<p>html-only</p>')
    expect(raw).not.toContain('multipart/')
  })

  it('emits multipart/alternative when both bodyText and bodyHtml are provided', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 't1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ to: ['x@y.com'], subject: 'S', bodyText: 'plain fallback', bodyHtml: '<p>rich</p>' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Content-Type: multipart/alternative;')
    expect(raw).toContain('plain fallback')
    expect(raw).toContain('<p>rich</p>')
  })

  it('errors when neither bodyText nor bodyHtml is provided', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ to: ['x@y.com'], subject: 'S' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/At least one of `bodyText` or `bodyHtml`/)
    expect(gmail.users.drafts.create).not.toHaveBeenCalled()
  })
})

describe('handleCreateDraft (replyAll)', () => {
  // Helper: the original message Gmail returns when we fetch it for a reply-all.
  const origMessage = (overrides: Record<string, string> = {}) => ({
    data: {
      threadId: 'T1',
      payload: {
        headers: [
          { name: 'Message-ID', value: '<orig@gmail.com>' },
          { name: 'Subject', value: 'Project update' },
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'To', value: 'me@self.test, Bob <bob@example.com>' },
          { name: 'Cc', value: 'carol@example.com, ME@SELF.test' },
          ...Object.entries(overrides).map(([name, value]) => ({ name, value }))
        ]
      }
    }
  })

  it('auto-populates to (= From + original To) and cc (= original Cc), excluding the authenticated account', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'thanks' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])

    // To = From + original To, with the authenticated address removed (case-insensitive)
    expect(raw).toContain('To: Alice <alice@example.com>, Bob <bob@example.com>\r\n')
    // Cc = original Cc, also with the authenticated address removed
    expect(raw).toContain('Cc: carol@example.com\r\n')
    // Threading preserved
    expect(raw).toContain('In-Reply-To: <orig@gmail.com>\r\n')
    // Re: subject preserved
    expect(raw).toContain('Subject: Re: Project update\r\n')
  })

  it("caller's explicit `to` and `cc` win over auto-population", async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({
      replyToMessageId: 'orig',
      replyAll: true,
      to: ['only-me@override.com'],
      cc: ['cc-override@override.com'],
      bodyText: 'b'
    })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])

    expect(raw).toContain('To: only-me@override.com\r\n')
    expect(raw).toContain('Cc: cc-override@override.com\r\n')
    // No auto-populated addresses present
    expect(raw).not.toContain('alice@example.com')
    expect(raw).not.toContain('bob@example.com')
    expect(raw).not.toContain('carol@example.com')
  })

  it('returns an error when replyAll is true but replyToMessageId is missing', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ replyAll: true, to: ['x@y.com'], subject: 'S', bodyText: 'b' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/`replyAll` requires `replyToMessageId`/)
  })

  it('does NOT call getProfile for plain replies (replyAll: false / omitted)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', to: ['alice@example.com'], bodyText: 'b' })
    expect(gmail.users.getProfile).not.toHaveBeenCalled()
  })

  it('caches the authenticated email — second reply-all does not refetch the profile', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b1' })
    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b2' })
    expect((gmail.users.getProfile as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('drops the authenticated address from auto-populated cc even when it appears only there', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        threadId: 'T1',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig@gmail.com>' },
            { name: 'Subject', value: 'Update' },
            { name: 'From', value: 'alice@example.com' },
            { name: 'To', value: 'bob@example.com' },
            { name: 'Cc', value: 'me@self.test, dave@example.com' }
          ]
        }
      }
    })
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('Cc: dave@example.com\r\n')
    expect(raw).not.toMatch(/Cc:.*me@self\.test/)
  })

  it('does not duplicate an address that appears in both auto-populated to and cc', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        threadId: 'T1',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig@gmail.com>' },
            { name: 'Subject', value: 'Update' },
            { name: 'From', value: 'alice@example.com' },
            { name: 'To', value: 'bob@example.com' },
            // bob also shows up in Cc — should not appear in BOTH the resolved To and Cc.
            { name: 'Cc', value: 'bob@example.com, carol@example.com' }
          ]
        }
      }
    })
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('To: alice@example.com, bob@example.com\r\n')
    // Cc must NOT also list bob (already in To); carol remains.
    expect(raw).toContain('Cc: carol@example.com\r\n')
  })

  it("returns an error when getProfile returns no emailAddress (can't safely dedupe self)", async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Gmail returned an empty profile/)
  })

  it('handles an original message with no Cc header (auto-populated cc is empty)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        threadId: 'T1',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig@gmail.com>' },
            { name: 'Subject', value: 'No-Cc thread' },
            { name: 'From', value: 'alice@example.com' },
            { name: 'To', value: 'me@self.test, bob@example.com' }
            // Cc deliberately omitted
          ]
        }
      }
    })
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b' })
    const raw = decodeRaw((gmail.users.drafts.create as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(raw).toContain('To: alice@example.com, bob@example.com\r\n')
    // No Cc header should be emitted when the auto-populated cc list is empty.
    expect(raw).not.toMatch(/^Cc:/m)
  })

  it('requests From/To/Cc metadataHeaders for reply-all (not just the plain-reply set)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(origMessage())
    ;(gmail.users.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { emailAddress: 'me@self.test' } })
    ;(gmail.users.drafts.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'm1', threadId: 'T1' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateDraft({ replyToMessageId: 'orig', replyAll: true, bodyText: 'b' })
    const headers = (gmail.users.messages.get as ReturnType<typeof vi.fn>).mock.calls[0][0].metadataHeaders
    expect(headers).toEqual(expect.arrayContaining(['Message-ID', 'Subject', 'References', 'From', 'To', 'Cc']))
  })
})

describe('handleUpdateDraft', () => {
  it('replaces the draft contents at the given draftId', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { id: 'mNew', threadId: 'tNew' } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateDraft({ draftId: 'd1', to: ['x@y.com'], subject: 'New subj', bodyText: 'new body' })
    expect(JSON.parse(r.content[0].text)).toEqual({ draftId: 'd1', messageId: 'mNew', threadId: 'tNew' })

    const call = (gmail.users.drafts.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.id).toBe('d1')
    expect(decodeRaw(call)).toContain('Subject: New subj\r\n')
  })

  it('falls back to the requested draftId when the API response omits id', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateDraft({ draftId: 'asked', to: ['x@y.com'], subject: 'S', bodyText: 'b' })
    expect(JSON.parse(r.content[0].text).draftId).toBe('asked')
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateDraft({ draftId: 'd1', to: ['x@y.com'], subject: 'S', bodyText: 'b' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error updating draft: nope/)
  })
})

describe('handleListDrafts', () => {
  it('hydrates each draft with header metadata and snippet', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [{ id: 'd1' }, { id: 'd2' }] } })
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockImplementation(({ id }) =>
      Promise.resolve({
        data: {
          id,
          message: {
            id: `m-${id}`,
            threadId: `t-${id}`,
            snippet: `snippet ${id}`,
            payload: {
              headers: [
                { name: 'Subject', value: `Subj ${id}` },
                { name: 'To', value: `to-${id}@x.com` },
                { name: 'Date', value: `date-${id}` }
              ]
            }
          }
        }
      })
    )
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({ maxResults: 2 })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.drafts).toHaveLength(2)
    expect(payload.drafts[0]).toMatchObject({
      draftId: 'd1',
      messageId: 'm-d1',
      threadId: 't-d1',
      subject: 'Subj d1',
      to: 'to-d1@x.com',
      date: 'date-d1',
      snippet: 'snippet d1'
    })
  })

  it('forwards query, maxResults, and pageToken to the API', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleListDrafts({ query: 'to:foo@x.com', maxResults: 5, pageToken: 'TK' })
    expect(gmail.users.drafts.list).toHaveBeenCalledWith({ userId: 'me', q: 'to:foo@x.com', maxResults: 5, pageToken: 'TK' })
  })

  it('defaults maxResults to DEFAULT_SEARCH_RESULTS when omitted', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleListDrafts({})
    expect((gmail.users.drafts.list as ReturnType<typeof vi.fn>).mock.calls[0][0].maxResults).toBe(20)
  })

  it('returns nextPageToken when Gmail signals more results', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [], nextPageToken: 'NEXT' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({})
    expect(JSON.parse(r.content[0].text).nextPageToken).toBe('NEXT')
  })

  it('omits nextPageToken on the last page', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({})
    expect(JSON.parse(r.content[0].text)).toEqual({ drafts: [] })
  })

  it('handles a sparse drafts entry (no id, no message)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { drafts: [{}] } })
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({})
    expect(JSON.parse(r.content[0].text).drafts[0]).toEqual({
      draftId: '',
      messageId: '',
      threadId: '',
      subject: '',
      to: '',
      cc: '',
      date: '',
      snippet: ''
    })
  })

  it('returns an empty drafts array when Gmail omits the drafts key entirely', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({})
    expect(JSON.parse(r.content[0].text)).toEqual({ drafts: [] })
  })

  it('returns an error result on list failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.list as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 500, data: { error: { message: 'Internal' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListDrafts({})
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 500: Internal/)
  })
})

describe('handleGetDraft', () => {
  it('returns headers, body, label ids, and attachment refs', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'd1',
        message: {
          id: 'm1',
          threadId: 't1',
          labelIds: ['DRAFT'],
          payload: {
            headers: [
              { name: 'Subject', value: 'Hi' },
              { name: 'From', value: 'me@x' },
              { name: 'To', value: 'b@x' },
              { name: 'Cc', value: 'c@x' },
              { name: 'Bcc', value: 'd@x' },
              { name: 'Date', value: 'date-val' }
            ],
            parts: [
              { mimeType: 'text/plain', body: { data: b64('Draft body') } },
              { mimeType: 'application/pdf', filename: 'r.pdf', body: { attachmentId: 'A1', size: 11 } }
            ]
          }
        }
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetDraft({ draftId: 'd1' })
    expect(JSON.parse(r.content[0].text)).toMatchObject({
      draftId: 'd1',
      messageId: 'm1',
      threadId: 't1',
      subject: 'Hi',
      to: 'b@x',
      cc: 'c@x',
      bcc: 'd@x',
      body: 'Draft body',
      labelIds: ['DRAFT'],
      attachments: [{ attachmentId: 'A1', filename: 'r.pdf', mimeType: 'application/pdf', size: 11 }]
    })
  })

  it('falls back to the requested draftId when the API omits id', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetDraft({ draftId: 'asked' })
    expect(JSON.parse(r.content[0].text).draftId).toBe('asked')
  })

  it('returns an error result on 404', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetDraft({ draftId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})

describe('handleDeleteDraft', () => {
  it('deletes the draft and returns the id with deleted: true when dry_run is false', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteDraft({ draftId: 'd1', dry_run: false })
    expect(JSON.parse(r.content[0].text)).toEqual({ draftId: 'd1', dry_run: false, deleted: true })
    expect(gmail.users.drafts.delete).toHaveBeenCalledWith({ userId: 'me', id: 'd1' })
  })

  it('returns a preview without calling delete when dry_run is true', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'd1', message: { payload: { headers: [{ name: 'Subject', value: 'Hi' }] } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteDraft({ draftId: 'd1', dry_run: true })
    expect(JSON.parse(r.content[0].text)).toEqual({
      draftId: 'd1',
      dry_run: true,
      deleted: false,
      would_delete: { draftId: 'd1', subject: 'Hi' }
    })
    expect(gmail.users.drafts.delete).not.toHaveBeenCalled()
  })

  it('previews with an empty subject when the draft has no headers / no Subject', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      // No payload at all → headers falls back to [] and subject to ''.
      data: { id: 'd1', message: {} }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteDraft({ draftId: 'd1', dry_run: true })
    expect(JSON.parse(r.content[0].text)).toEqual({
      draftId: 'd1',
      dry_run: true,
      deleted: false,
      would_delete: { draftId: 'd1', subject: '' }
    })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.drafts.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteDraft({ draftId: 'd1', dry_run: false })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})
