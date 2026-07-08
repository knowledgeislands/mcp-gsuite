import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const {
  getMessage,
  getRawMessage,
  labelMessage,
  messageArchive,
  messageBatchModify,
  messageMarkRead,
  messageMarkUnread,
  messageTrash,
  searchMessages,
  unlabelMessage
} = await import('./index.js')

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// Config is injected. The download-root points at the system tmp dir so the
// per-test mkdtemp paths resolve underneath it.
const cfg = { auth: {}, defaultSearchResults: 20, downloadPath: os.tmpdir() } as unknown as Config

// Bind cfg so the existing call sites stay unchanged.
const handleSearchMessages = (args: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }) =>
  searchMessages(cfg, args)
const handleGetMessage = (args: { messageId: string; format?: 'metadata' | 'full' }) => getMessage(cfg, args)
const handleGetRawMessage = (args: { messageId: string; outputPath: string }) => getRawMessage(cfg, args)
const handleLabelMessage = (args: { messageId: string; labelIds: string[] }) => labelMessage(cfg, args)
const handleUnlabelMessage = (args: { messageId: string; labelIds: string[] }) => unlabelMessage(cfg, args)
const handleMessageMarkRead = (args: { messageId: string }) => messageMarkRead(cfg, args)
const handleMessageMarkUnread = (args: { messageId: string }) => messageMarkUnread(cfg, args)
const handleMessageArchive = (args: { messageId: string }) => messageArchive(cfg, args)
const handleMessageTrash = (args: { messageId: string }) => messageTrash(cfg, args)
const handleMessageBatchModify = (args: { messageIds: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }) =>
  messageBatchModify(cfg, args)

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')

const makeGmail = () => ({
  users: {
    messages: {
      list: vi.fn(),
      get: vi.fn(),
      modify: vi.fn(),
      trash: vi.fn(),
      batchModify: vi.fn()
    }
  }
})

beforeEach(() => {
  gmailServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleSearchMessages', () => {
  it('fetches metadata for each result and returns the structured array', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [{ id: 'm1' }, { id: 'm2' }] } })
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockImplementation(({ id }) =>
      Promise.resolve({
        data: {
          id,
          threadId: `t-${id}`,
          snippet: `snippet ${id}`,
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'Subject', value: `Subj ${id}` },
              { name: 'From', value: `from-${id}@x.com` },
              { name: 'Date', value: 'Mon, 1 Jan 2026 00:00:00 +0000' }
            ]
          }
        }
      })
    )
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'has:attachment', maxResults: 2 })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.messages).toHaveLength(2)
    expect(payload.messages[0]).toMatchObject({
      messageId: 'm1',
      threadId: 't-m1',
      subject: 'Subj m1',
      from: 'from-m1@x.com',
      snippet: 'snippet m1',
      labelIds: ['INBOX'],
      hasAttachments: false
    })
  })

  it('passes the query, maxResults, and pageToken through to the API (no labelIds key when omitted)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchMessages({ query: 'from:foo', maxResults: 7, pageToken: 'TOKEN_X' })
    expect(gmail.users.messages.list).toHaveBeenCalledWith({ userId: 'me', q: 'from:foo', maxResults: 7, pageToken: 'TOKEN_X' })
  })

  it('normalises a quoted label name in the query before calling the API', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchMessages({ query: 'label:"Matters/Criminal - False Allegations"' })
    const args = (gmail.users.messages.list as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args.q).toBe('label:Matters/Criminal---False-Allegations')
  })

  it('passes labelIds through to the API when provided', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchMessages({ query: 'newer_than:30d', labelIds: ['Label_107', 'IMPORTANT'] })
    const args = (gmail.users.messages.list as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args.labelIds).toEqual(['Label_107', 'IMPORTANT'])
  })

  it('omits labelIds from the API call when given an empty array', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchMessages({ query: 'q', labelIds: [] })
    const args = (gmail.users.messages.list as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args).not.toHaveProperty('labelIds')
  })

  it('returns nextPageToken when Gmail signals there are more results', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [], nextPageToken: 'NEXT_TOKEN_42' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(JSON.parse(r.content[0].text).nextPageToken).toBe('NEXT_TOKEN_42')
  })

  it('omits nextPageToken when Gmail signals the last page', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(JSON.parse(r.content[0].text)).not.toHaveProperty('nextPageToken')
  })

  it('uses the default DEFAULT_SEARCH_RESULTS when maxResults is omitted', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchMessages({ query: 'q' })
    const args = (gmail.users.messages.list as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args.maxResults).toBe(20) // DEFAULT_SEARCH_RESULTS
  })

  it('reports hasAttachments=true when a part has a filename + attachmentId', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'm1',
        payload: {
          headers: [{ name: 'Subject', value: 'with-attach' }],
          parts: [
            { mimeType: 'text/plain', body: { data: b64('hi') } },
            { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'A1', size: 100 } }
          ]
        }
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(JSON.parse(r.content[0].text).messages[0].hasAttachments).toBe(true)
  })

  it('handles an empty list response (no messages key)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(JSON.parse(r.content[0].text)).toEqual({ messages: [] })
  })

  it('falls back gracefully when per-message responses omit optional fields', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { messages: [{}] } })
    // Message has no id, no threadId, no snippet, no labelIds, no payload.
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(JSON.parse(r.content[0].text).messages).toEqual([
      { messageId: '', threadId: '', subject: '', from: '', date: '', snippet: '', labelIds: [], hasAttachments: false }
    ])
  })

  it('returns an error result when list throws', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.list as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 500, data: { error: { message: 'Internal' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchMessages({ query: 'q' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 500: Internal/)
  })
})

describe('handleGetMessage', () => {
  it('returns full headers, body, label ids, and attachment refs', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'm1',
        threadId: 't1',
        labelIds: ['INBOX'],
        payload: {
          headers: [
            { name: 'Subject', value: 'Hi' },
            { name: 'From', value: 'a@x' },
            { name: 'To', value: 'b@x' },
            { name: 'Cc', value: 'c@x' },
            { name: 'Date', value: 'date-val' }
          ],
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Plain body') } },
            { mimeType: 'application/pdf', filename: 'r.pdf', body: { attachmentId: 'A1', size: 11 } }
          ]
        }
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetMessage({ messageId: 'm1' })
    const payload = JSON.parse(r.content[0].text)
    expect(payload).toMatchObject({
      messageId: 'm1',
      threadId: 't1',
      subject: 'Hi',
      from: 'a@x',
      to: 'b@x',
      cc: 'c@x',
      date: 'date-val',
      body: 'Plain body',
      labelIds: ['INBOX'],
      attachments: [{ attachmentId: 'A1', filename: 'r.pdf', mimeType: 'application/pdf', size: 11 }]
    })
  })

  it('requests format=full', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', payload: {} } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetMessage({ messageId: 'm1' })
    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
  })

  it('falls back to the requested messageId and empty fields when the API response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetMessage({ messageId: 'req-id' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      messageId: 'req-id',
      threadId: '',
      subject: '',
      from: '',
      to: '',
      cc: '',
      date: '',
      body: '',
      labelIds: [],
      attachments: []
    })
  })

  it('returns an error result on 404', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetMessage({ messageId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })

  it('defaults to format=full when no format is provided (back-compat)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'm1', threadId: 't1', payload: { headers: [{ name: 'Subject', value: 'S' }] } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetMessage({ messageId: 'm1' })
    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
  })

  it("passes format='metadata' through to the Gmail API verbatim", async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'm1',
        threadId: 't1',
        labelIds: ['INBOX'],
        // metadata responses have headers but no parts and no body data.
        payload: {
          headers: [
            { name: 'Subject', value: 'Cheap envelope' },
            { name: 'From', value: 'a@b.com' },
            { name: 'To', value: 'me@self.test' }
          ]
        }
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetMessage({ messageId: 'm1', format: 'metadata' })
    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'metadata' })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.subject).toBe('Cheap envelope')
    expect(payload.from).toBe('a@b.com')
    expect(payload.to).toBe('me@self.test')
    expect(payload.labelIds).toEqual(['INBOX'])
    // body + attachments are empty since metadata responses omit the part tree.
    expect(payload.body).toBe('')
    expect(payload.attachments).toEqual([])
  })
})

describe('handleGetRawMessage', () => {
  let tmpDir: string
  let outputPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-raw-msg-'))
    outputPath = path.join(tmpDir, 'message.eml')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('decodes the base64url raw field and writes it to outputPath', async () => {
    const rfc2822 = 'From: a@x\nSubject: hello\n\nbody'
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64(rfc2822) } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'm1', outputPath })
    const payload = JSON.parse(r.content[0].text)
    expect(payload).toEqual({ messageId: 'm1', path: outputPath, sizeBytes: rfc2822.length })

    // Verify the file on disk contains the decoded bytes.
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(rfc2822)
  })

  it('omits subject/date — those live inside the raw bytes and the caller already has them from get_message', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64('hi') } })
    gmailServiceMock.mockReturnValue(gmail)

    const payload = JSON.parse((await handleGetRawMessage({ messageId: 'm1', outputPath })).content[0].text)
    expect(payload).not.toHaveProperty('subject')
    expect(payload).not.toHaveProperty('date')
  })

  it('requests format=raw', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64('x') } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetRawMessage({ messageId: 'm1', outputPath })
    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'raw' })
  })

  it('does NOT return the raw bytes in the tool response (must travel via the file)', async () => {
    const bigPayload = 'X'.repeat(50_000)
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64(bigPayload) } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'm1', outputPath })
    // Response text should be small — no echo of the payload.
    expect(r.content[0].text.length).toBeLessThan(500)
    expect(r.content[0].text).not.toContain('XXX')
    // But the file should be the full thing.
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(bigPayload)
  })

  it('creates parent directories if they do not exist', async () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'msg.eml')
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64('hi') } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetRawMessage({ messageId: 'm1', outputPath: nested })
    expect(fs.existsSync(nested)).toBe(true)
  })

  it('returns an error result when the API omits the raw field', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'm1', outputPath })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/no raw content/i)
    expect(fs.existsSync(outputPath)).toBe(false)
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'm1', outputPath })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error getting raw message: boom/)
  })

  it('rejects an outputPath that resolves outside MCP_GSUITE_DOWNLOAD_PATH', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64('x') } })
    gmailServiceMock.mockReturnValue(gmail)

    // /etc lives outside the configured tmpdir root.
    const r = await handleGetRawMessage({ messageId: 'm1', outputPath: '/etc/escape.eml' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/escapes download root/)
    expect(fs.existsSync('/etc/escape.eml')).toBe(false)
    // The Gmail API must not have been called — validation runs first.
    expect(gmail.users.messages.get).not.toHaveBeenCalled()
  })
})

describe('handleGetRawMessage (degraded response shapes)', () => {
  let tmpDir2: string
  let outputPath2: string

  beforeEach(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-raw-msg-degraded-'))
    outputPath2 = path.join(tmpDir2, 'msg.eml')
  })

  afterEach(() => {
    fs.rmSync(tmpDir2, { recursive: true, force: true })
  })

  it('falls back to the requested messageId when the API response omits id', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { raw: b64('x') } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'req-raw-id', outputPath: outputPath2 })
    expect(JSON.parse(r.content[0].text).messageId).toBe('req-raw-id')
  })

  it('handles a response with no payload/headers (the realistic format=raw shape)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', raw: b64('bytes') } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetRawMessage({ messageId: 'm1', outputPath: outputPath2 })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', path: outputPath2, sizeBytes: 5 })
  })
})

describe('handleLabelMessage', () => {
  it('calls modify with addLabelIds and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: ['INBOX', 'X'] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelMessage({ messageId: 'm1', labelIds: ['X'] })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({ userId: 'me', id: 'm1', requestBody: { addLabelIds: ['X'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: ['INBOX', 'X'] })
  })

  it('falls back to the requested messageId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelMessage({ messageId: 'req-label-id', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'req-label-id', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Bad label' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelMessage({ messageId: 'm1', labelIds: ['bogus'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 400: Bad label/)
  })
})

describe('handleUnlabelMessage', () => {
  it('calls modify with removeLabelIds and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: ['INBOX'] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelMessage({ messageId: 'm1', labelIds: ['X'] })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({ userId: 'me', id: 'm1', requestBody: { removeLabelIds: ['X'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: ['INBOX'] })
  })

  it('falls back to the requested messageId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelMessage({ messageId: 'req-unlabel-id', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'req-unlabel-id', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelMessage({ messageId: 'm1', labelIds: ['X'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error unlabeling message: nope/)
  })
})

describe('handleMessageMarkRead', () => {
  it('removes the UNREAD label and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: ['INBOX'] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageMarkRead({ messageId: 'm1' })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({ userId: 'me', id: 'm1', requestBody: { removeLabelIds: ['UNREAD'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: ['INBOX'] })
  })

  it('falls back to the requested messageId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageMarkRead({ messageId: 'asked' })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'asked', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageMarkRead({ messageId: 'm1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error marking message read: nope/)
  })
})

describe('handleMessageMarkUnread', () => {
  it('adds the UNREAD label and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: ['INBOX', 'UNREAD'] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageMarkUnread({ messageId: 'm1' })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({ userId: 'me', id: 'm1', requestBody: { addLabelIds: ['UNREAD'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: ['INBOX', 'UNREAD'] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageMarkUnread({ messageId: 'm1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error marking message unread: nope/)
  })
})

describe('handleMessageArchive', () => {
  it('removes the INBOX label and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageArchive({ messageId: 'm1' })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({ userId: 'me', id: 'm1', requestBody: { removeLabelIds: ['INBOX'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageArchive({ messageId: 'm1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error archiving message: nope/)
  })
})

describe('handleMessageTrash', () => {
  it('calls messages.trash and returns the updated label ids', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.trash as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'm1', labelIds: ['TRASH'] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageTrash({ messageId: 'm1' })
    expect(gmail.users.messages.trash).toHaveBeenCalledWith({ userId: 'me', id: 'm1' })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'm1', labelIds: ['TRASH'] })
  })

  it('falls back to the requested messageId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.trash as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageTrash({ messageId: 'asked' })
    expect(JSON.parse(r.content[0].text)).toEqual({ messageId: 'asked', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.trash as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageTrash({ messageId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})

describe('handleMessageBatchModify', () => {
  it('calls messages.batchModify with ids + addLabelIds and echoes the operation', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.batchModify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: '' })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1', 'm2', 'm3'], addLabelIds: ['Label_42'] })
    expect(gmail.users.messages.batchModify).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { ids: ['m1', 'm2', 'm3'], addLabelIds: ['Label_42'], removeLabelIds: undefined }
    })
    expect(JSON.parse(r.content[0].text)).toEqual({
      count: 3,
      messageIds: ['m1', 'm2', 'm3'],
      addLabelIds: ['Label_42'],
      removeLabelIds: []
    })
  })

  it('passes removeLabelIds through and defaults the omitted side to []', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.batchModify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: '' })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1'], removeLabelIds: ['INBOX'] })
    expect(gmail.users.messages.batchModify).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { ids: ['m1'], addLabelIds: undefined, removeLabelIds: ['INBOX'] }
    })
    expect(JSON.parse(r.content[0].text)).toEqual({ count: 1, messageIds: ['m1'], addLabelIds: [], removeLabelIds: ['INBOX'] })
  })

  it('supports both add and remove in a single call', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.batchModify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: '' })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1', 'm2'], addLabelIds: ['A'], removeLabelIds: ['B'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ count: 2, messageIds: ['m1', 'm2'], addLabelIds: ['A'], removeLabelIds: ['B'] })
  })

  it('returns an error result when neither addLabelIds nor removeLabelIds is provided', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/At least one of `addLabelIds` or `removeLabelIds`/)
    expect(gmail.users.messages.batchModify).not.toHaveBeenCalled()
  })

  it('treats empty addLabelIds + empty removeLabelIds as no-op (same error)', async () => {
    const gmail = makeGmail()
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1'], addLabelIds: [], removeLabelIds: [] })
    expect(r).toHaveProperty('isError', true)
    expect(gmail.users.messages.batchModify).not.toHaveBeenCalled()
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.batchModify as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Invalid label id' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleMessageBatchModify({ messageIds: ['m1'], addLabelIds: ['bogus'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 400: Invalid label id/)
  })
})
