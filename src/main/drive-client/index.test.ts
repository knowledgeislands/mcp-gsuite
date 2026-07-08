import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  driveService: vi.fn()
}))

const client = await import('../google-client/index.js')
const { listFiles } = await import('./index.js')

const driveServiceMock = client.driveService as ReturnType<typeof vi.fn>

// Config is injected; only the slices these handlers read need to be present.
const cfg = { auth: {} } as unknown as Config

const makeDrive = () => ({
  files: {
    list: vi.fn()
  }
})

beforeEach(() => {
  driveServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listFiles', () => {
  it('returns the trimmed file list from the Drive API', async () => {
    const drive = makeDrive()
    drive.files.list.mockResolvedValue({
      data: {
        files: [
          { id: 'f1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-07-01T00:00:00Z' },
          { id: 'f2', name: 'Notes.md', mimeType: 'text/markdown', modifiedTime: '2026-06-01T00:00:00Z' }
        ]
      }
    })
    driveServiceMock.mockReturnValue(drive)

    const r = await listFiles(cfg, { folderId: 'root' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      files: [
        { id: 'f1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-07-01T00:00:00Z' },
        { id: 'f2', name: 'Notes.md', mimeType: 'text/markdown', modifiedTime: '2026-06-01T00:00:00Z' }
      ]
    })
    expect(drive.files.list).toHaveBeenCalledWith({
      q: "'root' in parents and trashed = false",
      pageSize: undefined,
      fields: 'files(id,name,mimeType,modifiedTime)'
    })
  })

  it('builds the q filter from nameContains and mimeType, and passes pageSize', async () => {
    const drive = makeDrive()
    drive.files.list.mockResolvedValue({ data: { files: [] } })
    driveServiceMock.mockReturnValue(drive)

    const r = await listFiles(cfg, { folderId: 'abc', nameContains: 'plan', mimeType: 'application/pdf', pageSize: 5 })
    expect(JSON.parse(r.content[0].text)).toEqual({ files: [] })
    expect(drive.files.list).toHaveBeenCalledWith({
      q: "'abc' in parents and trashed = false and name contains 'plan' and mimeType = 'application/pdf'",
      pageSize: 5,
      fields: 'files(id,name,mimeType,modifiedTime)'
    })
  })

  it("escapes single quotes and backslashes in q values (e.g. a nameContains of Kris's)", async () => {
    const drive = makeDrive()
    drive.files.list.mockResolvedValue({ data: {} })
    driveServiceMock.mockReturnValue(drive)

    await listFiles(cfg, { folderId: 'abc', nameContains: "Kris's \\ files" })
    expect(drive.files.list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "'abc' in parents and trashed = false and name contains 'Kris\\'s \\\\ files'"
      })
    )
  })

  it('handles a missing files array and defaults missing fields to empty strings', async () => {
    const drive = makeDrive()
    drive.files.list.mockResolvedValueOnce({ data: {} })
    driveServiceMock.mockReturnValue(drive)

    const empty = await listFiles(cfg, { folderId: 'root' })
    expect(JSON.parse(empty.content[0].text)).toEqual({ files: [] })

    drive.files.list.mockResolvedValueOnce({ data: { files: [{}] } })
    const sparse = await listFiles(cfg, { folderId: 'root' })
    expect(JSON.parse(sparse.content[0].text)).toEqual({ files: [{ id: '', name: '', mimeType: '', modifiedTime: '' }] })
  })

  it('returns an error result when the Drive API throws', async () => {
    const drive = makeDrive()
    drive.files.list.mockRejectedValue({
      response: { status: 401, data: { error: { message: 'Invalid Credentials' } } }
    })
    driveServiceMock.mockReturnValue(drive)

    const r = await listFiles(cfg, { folderId: 'root' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe(
      'Error listing Drive files: HTTP 401: Invalid Credentials — Run the `gsuite_auth_start` tool to refresh the OAuth token.'
    )
  })

  it('returns an error result when driveService itself throws (no token)', async () => {
    driveServiceMock.mockImplementation(() => {
      throw new Error('No tokens found at /tmp/x')
    })

    const r = await listFiles(cfg, { folderId: 'root' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/No tokens found/)
  })
})
