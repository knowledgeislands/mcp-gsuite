import { beforeEach, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({ gmailService: vi.fn() }))

import { gmailService } from '../google-client/index.js'
import { forwardDraft } from './forward.js'

const cfg = { auth: {} } as Config
const part = (overrides = {}) => ({
  filename: 'x.bin',
  mimeType: 'application/octet-stream',
  body: { size: 2, data: 'AQI' },
  ...overrides
})
let get: ReturnType<typeof vi.fn>, fetch: ReturnType<typeof vi.fn>, create: ReturnType<typeof vi.fn>
const run = async () =>
  (await forwardDraft(cfg, { messageId: 'm1', to: ['x@example.com'] })) as {
    isError?: boolean
    structuredContent?: Record<string, unknown>
  }
beforeEach(() => {
  get = vi.fn().mockResolvedValue({
    data: {
      payload: { mimeType: 'text/plain', body: { size: 8, data: Buffer.from('original').toString('base64url') } }
    }
  })
  fetch = vi.fn().mockResolvedValue({ data: { data: 'AQI' } })
  create = vi.fn().mockResolvedValue({ data: { id: 'draft1' } })
  vi.mocked(gmailService).mockReturnValue({
    users: { messages: { get, attachments: { get: fetch } }, drafts: { create } }
  } as never)
})
it('quotes the original into a draft with explicit recipients and no send', async () => {
  expect((await run()).isError).toBeUndefined()
  const raw = Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()
  expect(raw).toContain('original')
  expect(raw).toContain('To: x@example.com')
  expect(raw).toContain('Subject: Fwd:')
})
it('preserves remote and inline bytes, unnamed inline parts, HTML fallback and existing prefix', async () => {
  get.mockResolvedValue({
    data: {
      payload: {
        mimeType: 'multipart/mixed',
        headers: [{ name: 'Subject', value: 'Fwd: existing' }],
        parts: [
          { mimeType: 'text/html', body: { size: 12, data: Buffer.from('<p>Hello</p>').toString('base64url') } },
          part({ body: { size: 2, attachmentId: 'a' } }),
          part({ filename: '', mimeType: undefined })
        ]
      }
    }
  })
  expect((await run()).structuredContent).toMatchObject({ attachmentCount: 2, attachmentBytes: 4 })
  const raw = Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()
  expect(raw).toContain('Hello')
  expect(raw).toContain('inline-2')
  expect(raw).toContain('AQI=')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it.each([
  undefined,
  { mimeType: 'multipart/mixed', filename: 'nested.eml', parts: [part()] },
  { mimeType: 'multipart/mixed', body: { attachmentId: 'nested' }, parts: [part()] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: 0, data: 'A' } })] },
  { mimeType: 'multipart/mixed', parts: Array.from({ length: 51 }, () => part()) },
  { mimeType: 'multipart/mixed', parts: [part({ body: undefined })] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: -1 } })] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: 10 * 1024 * 1024 + 1 } })] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: 2 } })] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: 2, data: '!' } })] },
  { mimeType: 'multipart/mixed', parts: [part({ body: { size: 1, data: 'AQI' } })] },
  { mimeType: 'multipart/mixed', parts: [part({ filename: 'bad\nheader' })] },
  {
    mimeType: 'text/plain',
    body: { size: 10 * 1024 * 1024, data: Buffer.from('x'.repeat(10 * 1024 * 1024)).toString('base64url') }
  }
])('rejects invalid or oversized provider parts without creating a draft', async (payload) => {
  get.mockResolvedValue({ data: { payload } })
  expect((await run()).isError).toBe(true)
  expect(create).not.toHaveBeenCalled()
})
it('rejects excessive encoded bytes before decode', async () => {
  get.mockResolvedValue({
    data: {
      payload: { mimeType: 'multipart/mixed', parts: [part({ body: { size: 2, data: 'A'.repeat(14 * 1024 * 1024) } })] }
    }
  })
  expect((await run()).isError).toBe(true)
})
it('rejects invalid direct input before provider calls', async () => {
  expect(await forwardDraft(cfg, { messageId: 'm1', to: ['x\ny'] })).toMatchObject({ isError: true })
  expect(get).not.toHaveBeenCalled()
})
it('surfaces provider failures', async () => {
  get.mockRejectedValue(new Error('fixture failure'))
  expect((await run()).isError).toBe(true)
})

it('quotes the HTML body rather than a text attachment and preserves the attachment', async () => {
  get.mockResolvedValue({
    data: {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            filename: 'notes.txt',
            mimeType: 'text/plain',
            body: { size: 10, data: Buffer.from('ATTACHMENT').toString('base64url') }
          },
          {
            mimeType: 'text/html',
            body: { size: 21, data: Buffer.from('<p>ORIGINAL BODY!</p>').toString('base64url') }
          }
        ]
      }
    }
  })
  expect((await run()).structuredContent).toMatchObject({ attachmentCount: 1, attachmentBytes: 10 })
  const raw = Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()
  expect(raw).toContain('ORIGINAL BODY!')
  expect(raw).not.toContain('\r\nATTACHMENT\r\n')
  expect(raw).toContain(Buffer.from('ATTACHMENT').toString('base64'))
})
it('treats attachment-disposition text as an attachment even without a filename', async () => {
  get.mockResolvedValue({
    data: {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            headers: [{ name: 'Content-Disposition', value: 'attachment' }],
            body: { size: 2, data: 'AQI' }
          },
          { mimeType: 'text/plain', body: { size: 4, data: Buffer.from('BODY').toString('base64url') } }
        ]
      }
    }
  })
  expect((await run()).structuredContent).toMatchObject({ attachmentCount: 1 })
  expect(Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()).toContain('BODY')
})
it('rejects malformed body bytes instead of succeeding with an empty quote', async () => {
  get.mockResolvedValue({ data: { payload: { mimeType: 'text/plain', body: { size: 5, data: '!' } } } })
  expect((await run()).isError).toBe(true)
  expect(create).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it('fetches an externally stored text body and quotes it rather than making it an attachment', async () => {
  get.mockResolvedValue({ data: { payload: { mimeType: 'text/plain', body: { size: 12, attachmentId: 'body1' } } } })
  fetch.mockResolvedValue({ data: { data: Buffer.from('REMOTE BODY!').toString('base64url') } })
  expect((await run()).structuredContent).toMatchObject({ attachmentCount: 0, attachmentBytes: 0 })
  expect(fetch).toHaveBeenCalledWith({ userId: 'me', messageId: 'm1', id: 'body1' })
  expect(Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()).toContain('REMOTE BODY!')
})
it('rejects oversized external bodies before fetching', async () => {
  get.mockResolvedValue({
    data: { payload: { mimeType: 'text/plain', body: { size: 10 * 1024 * 1024 + 1, attachmentId: 'body1' } } }
  })
  expect((await run()).isError).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
})

it('retains a named externally stored text part as an attachment', async () => {
  get.mockResolvedValue({
    data: {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          { filename: 'notes.txt', mimeType: 'text/plain', body: { size: 2, attachmentId: 'notes' } },
          { mimeType: 'text/plain', body: { size: 4, data: Buffer.from('BODY').toString('base64url') } }
        ]
      }
    }
  })
  expect((await run()).structuredContent).toMatchObject({ attachmentCount: 1, attachmentBytes: 2 })
  const raw = Buffer.from(create.mock.calls[0][0].requestBody.message.raw, 'base64url').toString()
  expect(raw).toContain('BODY')
  expect(raw).toContain('AQI=')
})
it('rejects a non-UTF-8 body instead of silently replacing bytes', async () => {
  get.mockResolvedValue({ data: { payload: { mimeType: 'text/plain', body: { size: 1, data: '_w' } } } })
  expect((await run()).isError).toBe(true)
  expect(create).not.toHaveBeenCalled()
})
it('rejects attachment-disposition multipart containers', async () => {
  get.mockResolvedValue({
    data: {
      payload: {
        mimeType: 'multipart/mixed',
        headers: [{ name: 'Content-Disposition', value: 'attachment' }],
        parts: [part()]
      }
    }
  })
  expect((await run()).isError).toBe(true)
  expect(create).not.toHaveBeenCalled()
})
