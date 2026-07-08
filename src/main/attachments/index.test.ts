import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const { getAttachment, getAttachmentMetadata } = await import('./index.js')

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// Config is injected. The download-root points at the system tmp dir; the
// inline cap keeps its production default of 256 KiB.
const cfg = { auth: {}, downloadPath: os.tmpdir(), inlineAttachmentMaxBytes: 256 * 1024 } as unknown as Config

// Bind cfg so the existing call sites stay unchanged.
const handleGetAttachment = (args: { messageId: string; attachmentId: string; outputPath?: string }) => getAttachment(cfg, args)
const handleGetAttachmentMetadata = (args: { messageId: string; attachmentId: string }) => getAttachmentMetadata(cfg, args)

const makeGmail = () => ({
  users: {
    messages: {
      get: vi.fn(),
      attachments: {
        get: vi.fn()
      }
    }
  }
})

const messageWithAttachment = (attachmentId: string, filename: string, mimeType: string, size: number) => ({
  data: {
    id: 'm1',
    payload: {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('hi', 'utf8').toString('base64url') } },
        { mimeType, filename, body: { attachmentId, size } }
      ]
    }
  }
})

beforeEach(() => {
  gmailServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleGetAttachment (inline / base64 response)', () => {
  it('returns {filename, mimeType, data} with the base64url data from the API verbatim', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'invoice.pdf', 'application/pdf', 12345)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: 'BASE64URL_DATA_xyz', size: 12345 }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      data: 'BASE64URL_DATA_xyz'
    })
  })

  it('does NOT re-encode the data field (passes through whatever Gmail returns)', async () => {
    const gmail = makeGmail()
    const rawFromApi = '-_AbC123-_' // base64url-safe chars
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'x.bin', 'application/octet-stream', 7)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: rawFromApi } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(JSON.parse(r.content[0].text).data).toBe(rawFromApi)
  })

  it('looks up filename/mimeType from the message payload', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'real-name.pdf', 'application/pdf', 100)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: 'd' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(JSON.parse(r.content[0].text).filename).toBe('real-name.pdf')

    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
    expect(gmail.users.messages.attachments.get).toHaveBeenCalledWith({ userId: 'me', messageId: 'm1', id: 'A1' })
  })

  // Bug 1 regression: previously the handler would fail with "Attachment X not found"
  // when the message payload didn't contain a matching part. Gmail's attachments.get
  // is the source of truth; if it succeeds, the tool should succeed too — even if
  // we can't resolve filename/mimeType locally.
  it('still calls the Gmail API and returns data even when the part metadata lookup misses', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A_DIFFERENT', 'x.pdf', 'application/pdf', 1)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: 'API_DATA' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'PASSED_ID' })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.data).toBe('API_DATA')
    // Filename / mimeType fall back when the local lookup misses.
    expect(payload.filename).toBe('')
    expect(payload.mimeType).toBe('application/octet-stream')
    // Gmail's API was actually invoked with the user-provided id.
    expect(gmail.users.messages.attachments.get).toHaveBeenCalledWith({ userId: 'me', messageId: 'm1', id: 'PASSED_ID' })
  })

  it('returns an error when the Gmail attachments.get itself 404s (the API is the source of truth)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(messageWithAttachment('A1', 'x.pdf', 'application/pdf', 1))
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Requested entity was not found.' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'BOGUS' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Requested entity was not found\./)
  })

  it('returns an empty data string when the attachment payload has no data', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'x.bin', 'application/octet-stream', 0)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(JSON.parse(r.content[0].text).data).toBe('')
  })

  it('returns an error result when the message fetch fails', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'gone', attachmentId: 'A1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })

  it('returns an error result when the attachment fetch fails', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'x.bin', 'application/octet-stream', 0)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 500, data: { error: { message: 'Internal' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 500: Internal/)
  })

  it('rejects (without fetching bytes) when the metadata reports size above the inline cap', async () => {
    const oversized = 256 * 1024 + 1
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'huge.bin', 'application/octet-stream', oversized)
    )
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/exceeds the inline cap/)
    expect(r.content[0].text).toMatch(/outputPath/)
    // The bytes fetch must not have run — we should have failed fast on metadata.
    expect(gmail.users.messages.attachments.get).not.toHaveBeenCalled()
  })

  it('falls back to a post-fetch size check when metadata is missing (decoded byte length)', async () => {
    // Metadata lookup misses (attachmentId not in part tree), so the cap can only
    // be enforced after the bytes are fetched. The handler decodes and bails.
    const oversizedBase64 = 'a'.repeat(((256 * 1024 + 64) / 3 + 1) * 4)
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A_OTHER', 'x.bin', 'application/octet-stream', 1)
    )
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: oversizedBase64 } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A_PASSED' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/exceeds the inline cap/)
  })
})

describe('handleGetAttachment (outputPath: write decoded bytes to file)', () => {
  let tmpDir: string
  let outputPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-attach-'))
    outputPath = path.join(tmpDir, 'invoice.pdf')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes the decoded bytes to outputPath and returns {messageId, path, sizeBytes}', async () => {
    const original = 'Hello, this is the attachment content.'
    const b64data = Buffer.from(original, 'utf8').toString('base64url')

    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: b64data } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath })
    const payload = JSON.parse(r.content[0].text)
    expect(payload).toEqual({
      messageId: 'm1',
      path: outputPath,
      sizeBytes: original.length
    })
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(original)
  })

  // The caller already has filename/mimeType from get_message; surfacing potentially-empty
  // values here would be misleading. Same reasoning as the no-subject/no-date decision in
  // get_raw_message.
  it('does NOT include filename, mimeType, or `data` in the response (caller already has filename/mimeType from get_message)', async () => {
    const b64data = Buffer.from('x', 'utf8').toString('base64url')
    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: b64data } })
    gmailServiceMock.mockReturnValue(gmail)

    const payload = JSON.parse((await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath })).content[0].text)
    expect(payload).not.toHaveProperty('data')
    expect(payload).not.toHaveProperty('filename')
    expect(payload).not.toHaveProperty('mimeType')
  })

  // Performance + robustness: skipping messages.get avoids both a round-trip and the
  // bug-1 lookup-mismatch failure mode.
  it('skips the messages.get round-trip when outputPath is set', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: Buffer.from('x').toString('base64url') }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath })
    expect(gmail.users.messages.get).not.toHaveBeenCalled()
    expect(gmail.users.messages.attachments.get).toHaveBeenCalledWith({ userId: 'me', messageId: 'm1', id: 'A1' })
  })

  it('decodes base64url binary content correctly (round-trips raw bytes, not just UTF-8)', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x10, 0x20, 0xde, 0xad, 0xbe, 0xef])
    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: binary.toString('base64url') } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath })
    expect(fs.readFileSync(outputPath).equals(binary)).toBe(true)
  })

  it('creates parent directories if they do not exist', async () => {
    const nested = path.join(tmpDir, 'deep', 'sub', 'dir', 'a.pdf')
    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: Buffer.from('ok', 'utf8').toString('base64url') }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath: nested })
    expect(fs.existsSync(nested)).toBe(true)
  })

  it('writes an empty file when the attachment payload has no data (edge case)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.attachments.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachment({ messageId: 'm1', attachmentId: 'A1', outputPath })
    expect(JSON.parse(r.content[0].text).sizeBytes).toBe(0)
    expect(fs.readFileSync(outputPath).length).toBe(0)
  })
})

describe('handleGetAttachmentMetadata', () => {
  it('returns {messageId, attachmentId, filename, mimeType, sizeBytes} from the message part tree', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('A1', 'invoice.pdf', 'application/pdf', 98765)
    )
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachmentMetadata({ messageId: 'm1', attachmentId: 'A1' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      messageId: 'm1',
      attachmentId: 'A1',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 98765
    })
    // Crucial: we did NOT call attachments.get — that's the whole point of this tool.
    expect(gmail.users.messages.attachments.get).not.toHaveBeenCalled()
    expect(gmail.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
  })

  it('returns an error result when the attachmentId is not found on the message', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      messageWithAttachment('OTHER_ID', 'x.pdf', 'application/pdf', 1)
    )
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachmentMetadata({ messageId: 'm1', attachmentId: 'NOT_THERE' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/No attachment with id "NOT_THERE" on message "m1"/)
  })

  it('returns an error result when the message fetch fails', async () => {
    const gmail = makeGmail()
    ;(gmail.users.messages.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetAttachmentMetadata({ messageId: 'gone', attachmentId: 'A1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})
