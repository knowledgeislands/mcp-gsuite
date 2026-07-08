import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  gmailService: vi.fn()
}))

const auth = await import('../google-client/index.js')
const { createLabel, deleteLabel, listLabels, updateLabel } = await import('./index.js')

const gmailServiceMock = auth.gmailService as ReturnType<typeof vi.fn>

// Config is injected; only the slices these handlers read need to be present.
const cfg = { auth: {} } as unknown as Config

// Bind cfg so the existing call sites stay unchanged.
const handleListLabels = () => listLabels(cfg)
const handleCreateLabel = (args: { name: string }) => createLabel(cfg, args)
const handleUpdateLabel = (args: { labelId: string; name: string }) => updateLabel(cfg, args)
const handleDeleteLabel = (args: { labelId: string; dry_run: boolean }) => deleteLabel(cfg, args)

const makeGmail = (overrides: Record<string, unknown> = {}) => ({
  users: {
    labels: {
      list: vi.fn(),
      create: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      ...overrides
    }
  }
})

beforeEach(() => {
  gmailServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleListLabels', () => {
  it('returns the {id, name} list from the Gmail API', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        labels: [
          { id: 'INBOX', name: 'INBOX' },
          { id: 'Label_1', name: 'Custom' }
        ]
      }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListLabels()
    expect(JSON.parse(r.content[0].text)).toEqual({
      labels: [
        { id: 'INBOX', name: 'INBOX' },
        { id: 'Label_1', name: 'Custom' }
      ]
    })
    expect(gmail.users.labels.list).toHaveBeenCalledWith({ userId: 'me' })
  })

  it('handles an empty labels response', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListLabels()
    expect(JSON.parse(r.content[0].text)).toEqual({ labels: [] })
  })

  it('defaults missing id/name to empty strings', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { labels: [{}] } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListLabels()
    expect(JSON.parse(r.content[0].text)).toEqual({ labels: [{ id: '', name: '' }] })
  })

  it('returns an error result when the Gmail API throws', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.list as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 401, data: { error: { message: 'Invalid Credentials' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleListLabels()
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe(
      'Error listing labels: HTTP 401: Invalid Credentials — Run the `gsuite_auth_start` tool to refresh the OAuth token.'
    )
  })

  it('returns an error result when gmailService itself throws (no token)', async () => {
    gmailServiceMock.mockImplementation(() => {
      throw new Error('No tokens found at /tmp/x')
    })

    const r = await handleListLabels()
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/No tokens found/)
  })
})

describe('handleCreateLabel', () => {
  it('creates the label and returns labelId + name', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'Label_42', name: 'Archive/2026' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateLabel({ name: 'Archive/2026' })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: 'Label_42', name: 'Archive/2026' })
  })

  it('calls the API with the right shape (userId, requestBody, visibility flags)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'L1', name: 'X' } })
    gmailServiceMock.mockReturnValue(gmail)

    await handleCreateLabel({ name: 'X' })
    expect(gmail.users.labels.create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { name: 'X', labelListVisibility: 'labelShow', messageListVisibility: 'show' }
    })
  })

  it('falls back to the requested name if the API response omits it', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'L1' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateLabel({ name: 'Echo' })
    expect(JSON.parse(r.content[0].text).name).toBe('Echo')
  })

  it('defaults labelId to empty when the API omits id (but echoes a returned name)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { name: 'Foo-Renamed' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateLabel({ name: 'Foo' })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: '', name: 'Foo-Renamed' })
  })

  it('defaults both labelId and name when the API response is empty', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateLabel({ name: 'Foo' })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: '', name: 'Foo' })
  })

  it('returns an error result on conflict (label exists)', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 409, data: { error: { message: 'Label name exists or conflicts' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleCreateLabel({ name: 'INBOX' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error creating label: HTTP 409: Label name exists or conflicts')
  })
})

describe('handleUpdateLabel', () => {
  it('renames the label via labels.patch and returns the updated {labelId, name}', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'Label_42', name: 'Archive/2026' } })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateLabel({ labelId: 'Label_42', name: 'Archive/2026' })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: 'Label_42', name: 'Archive/2026' })
    expect(gmail.users.labels.patch).toHaveBeenCalledWith({
      userId: 'me',
      id: 'Label_42',
      requestBody: { name: 'Archive/2026' }
    })
  })

  it('falls back to the requested labelId and name when the API response is empty', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateLabel({ labelId: 'asked', name: 'NewName' })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: 'asked', name: 'NewName' })
  })

  it('returns an error result when Gmail rejects renaming a system label', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.patch as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'System labels cannot be modified' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleUpdateLabel({ labelId: 'INBOX', name: 'Mailbox' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error updating label: HTTP 400: System labels cannot be modified')
  })
})

describe('handleDeleteLabel', () => {
  it('deletes the label and returns {labelId, deleted: true} when dry_run is false', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteLabel({ labelId: 'Label_42', dry_run: false })
    expect(JSON.parse(r.content[0].text)).toEqual({ labelId: 'Label_42', dry_run: false, deleted: true })
    expect(gmail.users.labels.delete).toHaveBeenCalledWith({ userId: 'me', id: 'Label_42' })
  })

  it('returns a preview without calling delete when dry_run is true', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'Label_42', name: 'Archive/2026', type: 'user' }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteLabel({ labelId: 'Label_42', dry_run: true })
    expect(JSON.parse(r.content[0].text)).toEqual({
      labelId: 'Label_42',
      dry_run: true,
      deleted: false,
      would_delete: { labelId: 'Label_42', name: 'Archive/2026', type: 'user' }
    })
    expect(gmail.users.labels.delete).not.toHaveBeenCalled()
  })

  it('falls back to empty name/type in the dry_run preview when Gmail omits them', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'Label_42' }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteLabel({ labelId: 'Label_42', dry_run: true })
    expect(JSON.parse(r.content[0].text)).toEqual({
      labelId: 'Label_42',
      dry_run: true,
      deleted: false,
      would_delete: { labelId: 'Label_42', name: '', type: '' }
    })
  })

  it('returns an error result when Gmail rejects deleting a system label', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: 'System labels cannot be deleted' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteLabel({ labelId: 'INBOX', dry_run: false })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error deleting label: HTTP 400: System labels cannot be deleted')
  })

  it('returns an error result on 404', async () => {
    const gmail = makeGmail()
    ;(gmail.users.labels.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    gmailServiceMock.mockReturnValue(gmail)

    const r = await handleDeleteLabel({ labelId: 'nope', dry_run: false })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/HTTP 404: Not Found/)
  })
})
