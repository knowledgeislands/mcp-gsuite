import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const { getThread, labelThread, searchThreads, threadArchive, threadMarkRead, threadMarkUnread, threadTrash, unlabelThread } = await import(
  './index.js'
)

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// Config is injected; only the slices these handlers read need to be present.
const cfg = { auth: {}, defaultSearchResults: 20 } as unknown as Config

// Bind cfg so the existing call sites stay unchanged.
const handleSearchThreads = (args: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }) =>
  searchThreads(cfg, args)
const handleGetThread = (args: { threadId: string }) => getThread(cfg, args)
const handleLabelThread = (args: { threadId: string; labelIds: string[] }) => labelThread(cfg, args)
const handleUnlabelThread = (args: { threadId: string; labelIds: string[] }) => unlabelThread(cfg, args)
const handleThreadMarkRead = (args: { threadId: string }) => threadMarkRead(cfg, args)
const handleThreadMarkUnread = (args: { threadId: string }) => threadMarkUnread(cfg, args)
const handleThreadArchive = (args: { threadId: string }) => threadArchive(cfg, args)
const handleThreadTrash = (args: { threadId: string }) => threadTrash(cfg, args)

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')

const makeGmail = () => ({
  users: {
    threads: {
      list: vi.fn(),
      get: vi.fn(),
      modify: vi.fn(),
      trash: vi.fn()
    }
  }
})

beforeEach(() => {
  gmailServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleSearchThreads', () => {
  it('returns thread summaries (id, snippet, messageCount, latest-message headers, union of labels)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [{ id: 't1' }] } })
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 't1',
        snippet: 'thread snip',
        messages: [
          { id: 'm1', labelIds: ['INBOX', 'A'], payload: { headers: [{ name: 'Subject', value: 'first' }] } },
          {
            id: 'm2',
            labelIds: ['INBOX', 'B'],
            payload: {
              headers: [
                { name: 'Subject', value: 'reply' },
                { name: 'From', value: 'r@x' },
                { name: 'Date', value: 'Wed' }
              ]
            }
          }
        ]
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'topic', maxResults: 1 })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.threads).toEqual([
      {
        threadId: 't1',
        snippet: 'thread snip',
        messageCount: 2,
        latestSubject: 'reply',
        latestFrom: 'r@x',
        latestDate: 'Wed',
        labelIds: expect.arrayContaining(['INBOX', 'A', 'B'])
      }
    ])
    expect(payload.threads[0].labelIds).toHaveLength(3)
  })

  it('passes query, maxResults, and pageToken to the API', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchThreads({ query: 'from:foo', maxResults: 5, pageToken: 'TK' })
    expect(gmail.users.threads.list).toHaveBeenCalledWith({ userId: 'me', q: 'from:foo', maxResults: 5, pageToken: 'TK' })
  })

  it('normalises a quoted label name in the query and passes labelIds through when provided', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchThreads({ query: 'label:"Foo Bar"', labelIds: ['Label_9'] })
    const args = (gmail.users.threads.list as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args.q).toBe('label:Foo-Bar')
    expect(args.labelIds).toEqual(['Label_9'])
  })

  it('omits labelIds from the API call when given an empty array', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchThreads({ query: 'q', labelIds: [] })
    expect((gmail.users.threads.list as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('labelIds')
  })

  it('defaults maxResults to DEFAULT_SEARCH_RESULTS', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchThreads({ query: 'q' })
    expect((gmail.users.threads.list as ReturnType<typeof vi.fn>).mock.calls[0][0].maxResults).toBe(20)
  })

  it('returns nextPageToken when Gmail signals more results', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [], nextPageToken: 'NEXT' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'q' })
    expect(JSON.parse(r.content[0].text).nextPageToken).toBe('NEXT')
  })

  it('omits nextPageToken on the last page', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'q' })
    expect(JSON.parse(r.content[0].text)).not.toHaveProperty('nextPageToken')
  })

  it('returns an empty threads array when Gmail returns no threads key', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'q' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threads: [] })
  })

  it('handles a thread with no messages or headers', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [{ id: 't1' }] } })
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'q' })
    expect(JSON.parse(r.content[0].text).threads[0]).toEqual({
      threadId: '',
      snippet: '',
      messageCount: 0,
      latestSubject: '',
      latestFrom: '',
      latestDate: '',
      labelIds: []
    })
  })

  it('exercises the fallbacks: list entry has no id, fetched thread has a message without labelIds', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { threads: [{}] } })
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ id: 'm1', payload: { headers: [{ name: 'Subject', value: 'lone' }] } }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    await handleSearchThreads({ query: 'q' })
    // The list entry's `t.id` is undefined, so the API call falls back to ''.
    expect(gmail.users.threads.get).toHaveBeenCalledWith(expect.objectContaining({ id: '' }))
    // The message has no labelIds, so the label-union loop must tolerate the missing key.
    const payload = JSON.parse((await handleSearchThreads({ query: 'q' })).content[0].text)
    expect(payload.threads[0].labelIds).toEqual([])
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.list as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 500, data: { error: { message: 'Internal' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleSearchThreads({ query: 'q' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 500: Internal/)
  })
})

describe('handleGetThread', () => {
  it('returns every message with full headers, body, and attachment refs', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 't1',
        messages: [
          {
            id: 'm1',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Hi' },
                { name: 'From', value: 'a@x' },
                { name: 'To', value: 'b@x' },
                { name: 'Cc', value: 'c@x' },
                { name: 'Date', value: 'd1' }
              ],
              parts: [
                { mimeType: 'text/plain', body: { data: b64('msg one') } },
                { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'A1', size: 9 } }
              ]
            }
          },
          {
            id: 'm2',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Re: Hi' },
                { name: 'Date', value: 'd2' }
              ],
              body: { data: b64('reply') }
            }
          }
        ]
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetThread({ threadId: 't1' })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.threadId).toBe('t1')
    expect(payload.messageCount).toBe(2)
    expect(payload.messages[0]).toMatchObject({
      messageId: 'm1',
      subject: 'Hi',
      body: 'msg one',
      hasAttachments: true,
      attachments: [{ attachmentId: 'A1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 9 }]
    })
    expect(payload.messages[1]).toMatchObject({ messageId: 'm2', subject: 'Re: Hi', body: 'reply', hasAttachments: false })
  })

  it('requests format=full', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 't1' } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleGetThread({ threadId: 't1' })
    expect(gmail.users.threads.get).toHaveBeenCalledWith({ userId: 'me', id: 't1', format: 'full' })
  })

  it('falls back to the requested threadId when the API omits id, and returns an empty messages array', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetThread({ threadId: 'asked' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 'asked', messageCount: 0, messages: [] })
  })

  it('returns an error result on 404', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetThread({ threadId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })

  it('handles a message with no payload and no labelIds (every per-message fallback fires)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{}] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleGetThread({ threadId: 't1' })
    expect(JSON.parse(r.content[0].text).messages[0]).toEqual({
      messageId: '',
      subject: '',
      from: '',
      to: '',
      cc: '',
      date: '',
      body: '',
      labelIds: [],
      hasAttachments: false,
      attachments: []
    })
  })
})

describe('handleLabelThread', () => {
  it('calls threads.modify with addLabelIds and returns the union of labels across messages', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 't1',
        messages: [{ labelIds: ['INBOX', 'X'] }, { labelIds: ['INBOX', 'Y'] }]
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelThread({ threadId: 't1', labelIds: ['X', 'Y'] })
    const payload = JSON.parse(r.content[0].text)
    expect(payload.threadId).toBe('t1')
    expect(payload.labelIds).toEqual(expect.arrayContaining(['INBOX', 'X', 'Y']))
    expect(payload.labelIds).toHaveLength(3)
    expect(gmail.users.threads.modify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: { addLabelIds: ['X', 'Y'] } })
  })

  it('falls back to the requested threadId and an empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelThread({ threadId: 'asked', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 'asked', labelIds: [] })
  })

  it('handles messages without labelIds in the response', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 't1', messages: [{}] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelThread({ threadId: 't1', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Bad label' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleLabelThread({ threadId: 't1', labelIds: ['bogus'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 400: Bad label/)
  })
})

describe('handleUnlabelThread', () => {
  it('calls threads.modify with removeLabelIds and returns the union of remaining labels', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ labelIds: ['INBOX'] }, { labelIds: ['INBOX'] }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelThread({ threadId: 't1', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: ['INBOX'] })
    expect(gmail.users.threads.modify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: { removeLabelIds: ['X'] } })
  })

  it('falls back to the requested threadId when the API response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelThread({ threadId: 'asked', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 'asked', labelIds: [] })
  })

  it('handles messages without labelIds in the response', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 't1', messages: [{}] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelThread({ threadId: 't1', labelIds: ['X'] })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUnlabelThread({ threadId: 't1', labelIds: ['X'] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error unlabeling thread: nope/)
  })
})

describe('handleThreadMarkRead', () => {
  it('removes the UNREAD label and returns the union of remaining labels', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ labelIds: ['INBOX'] }, { labelIds: ['INBOX'] }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkRead({ threadId: 't1' })
    expect(gmail.users.threads.modify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: { removeLabelIds: ['UNREAD'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: ['INBOX'] })
  })

  it('falls back to the requested threadId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkRead({ threadId: 'asked' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 'asked', labelIds: [] })
  })

  it('tolerates a message in the response without a labelIds field (modify-helper fallback)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 't1', messages: [{}] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkRead({ threadId: 't1' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkRead({ threadId: 't1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error marking thread read: nope/)
  })
})

describe('handleThreadMarkUnread', () => {
  it('adds the UNREAD label and returns the union of resulting labels', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ labelIds: ['INBOX', 'UNREAD'] }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkUnread({ threadId: 't1' })
    expect(gmail.users.threads.modify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: { addLabelIds: ['UNREAD'] } })
    expect(JSON.parse(r.content[0].text).labelIds).toEqual(expect.arrayContaining(['INBOX', 'UNREAD']))
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadMarkUnread({ threadId: 't1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error marking thread unread: nope/)
  })
})

describe('handleThreadArchive', () => {
  it('removes the INBOX label and returns the union of remaining labels', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ labelIds: ['IMPORTANT'] }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadArchive({ threadId: 't1' })
    expect(gmail.users.threads.modify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: { removeLabelIds: ['INBOX'] } })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: ['IMPORTANT'] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.modify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadArchive({ threadId: 't1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/Error archiving thread: nope/)
  })
})

describe('handleThreadTrash', () => {
  it('calls threads.trash and returns the union of resulting labels', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.trash as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 't1', messages: [{ labelIds: ['TRASH'] }, { labelIds: ['TRASH'] }] }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadTrash({ threadId: 't1' })
    expect(gmail.users.threads.trash).toHaveBeenCalledWith({ userId: 'me', id: 't1' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: ['TRASH'] })
  })

  it('falls back to the requested threadId and empty labelIds when the response is minimal', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.trash as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadTrash({ threadId: 'asked' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 'asked', labelIds: [] })
  })

  it('tolerates a message in the trash response without a labelIds field', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.trash as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 't1', messages: [{}] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadTrash({ threadId: 't1' })
    expect(JSON.parse(r.content[0].text)).toEqual({ threadId: 't1', labelIds: [] })
  })

  it('returns an error result on API failure', async () => {
    const gmail = makeGmail()
    ;(gmail.users.threads.trash as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleThreadTrash({ threadId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})
