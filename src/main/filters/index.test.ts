import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({ gmailService: vi.fn() }))

const { gmailService } = await import('../google-client/index.js')
const { createFilter, deleteFilter, listFilters } = await import('./index.js')
const service = gmailService as ReturnType<typeof vi.fn>
const cfg = { auth: {} } as Config
const payload = (result: { structuredContent?: Record<string, unknown>; content: { text: string }[] }) => {
  if (!result.structuredContent) throw new Error(result.content[0]?.text)
  return result.structuredContent
}
const proposed = {
  criteria: { from: 'support@papaorg.co.uk' },
  action: { addLabelId: 'Label_123', skipInbox: true, markRead: true },
  dry_run: true
}

const gmail = () => ({
  users: {
    settings: {
      filters: {
        list: vi.fn().mockResolvedValue({ data: { filter: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'f1' } }),
        get: vi.fn().mockResolvedValue({ data: { id: 'f1' } }),
        delete: vi.fn().mockResolvedValue({ data: {} })
      }
    }
  }
})

beforeEach(() => service.mockReset())

describe('Gmail filters', () => {
  it('lists current filters', async () => {
    const client = gmail()
    client.users.settings.filters.list.mockResolvedValue({ data: { filter: [{ id: 'f1' }] } })
    service.mockReturnValue(client)
    const result = await listFilters(cfg)
    expect(payload(result)).toEqual({ filters: [{ id: 'f1' }] })
  })

  it('handles an empty list and reports a settings API failure', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.list.mockResolvedValueOnce({ data: {} })
    expect(payload(await listFilters(cfg))).toEqual({ filters: [] })
    client.users.settings.filters.list.mockRejectedValueOnce(new Error('settings unavailable'))
    expect(await listFilters(cfg)).toHaveProperty('isError', true)
  })

  it('previews criteria and actions without creating', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    const result = await createFilter(cfg, proposed)
    expect(payload(result)).toEqual({
      dry_run: true,
      created: false,
      existingFilterId: null,
      filter: {
        criteria: { from: 'support@papaorg.co.uk' },
        action: { addLabelIds: ['Label_123'], removeLabelIds: ['INBOX', 'UNREAD'] }
      }
    })
    expect(client.users.settings.filters.create).not.toHaveBeenCalled()
  })

  it('creates once and treats an exact duplicate as already present', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    const first = await createFilter(cfg, { ...proposed, dry_run: false })
    expect(payload(first)).toMatchObject({ created: true, dry_run: false })
    expect(client.users.settings.filters.create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        criteria: { from: 'support@papaorg.co.uk' },
        action: { addLabelIds: ['Label_123'], removeLabelIds: ['INBOX', 'UNREAD'] }
      }
    })
    client.users.settings.filters.list.mockResolvedValue({
      data: {
        filter: [
          {
            id: 'f1',
            criteria: { from: proposed.criteria.from },
            action: { addLabelIds: ['Label_123'], removeLabelIds: ['INBOX', 'UNREAD'] }
          }
        ]
      }
    })
    const second = await createFilter(cfg, { ...proposed, dry_run: false })
    expect(payload(second)).toMatchObject({ created: false, existingFilterId: 'f1' })
    expect(client.users.settings.filters.create).toHaveBeenCalledTimes(1)
  })

  it('stops on the same criteria with different actions', async () => {
    const client = gmail()
    client.users.settings.filters.list.mockResolvedValue({
      data: {
        filter: [{ id: 'f1', criteria: { from: proposed.criteria.from }, action: { addLabelIds: ['Label_other'] } }]
      }
    })
    service.mockReturnValue(client)
    const result = await createFilter(cfg, { ...proposed, dry_run: false })
    expect(result).toHaveProperty('isError', true)
    expect(client.users.settings.filters.create).not.toHaveBeenCalled()
  })

  it('rejects criteria-free and action-free requests before API calls', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    expect(await createFilter(cfg, { criteria: {}, action: { skipInbox: true }, dry_run: false })).toHaveProperty(
      'isError',
      true
    )
    expect(
      await createFilter(cfg, { criteria: { from: proposed.criteria.from }, action: {}, dry_run: false })
    ).toHaveProperty('isError', true)
    expect(client.users.settings.filters.list).not.toHaveBeenCalled()
  })

  it('supports a mark-read-only rule and tolerates incomplete existing filters', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.list.mockResolvedValue({
      data: {
        filter: [
          { id: 'other', action: {} },
          { id: 'extra', criteria: { from: proposed.criteria.from, subject: 'other' } }
        ]
      }
    })
    const result = await createFilter(cfg, {
      criteria: { from: proposed.criteria.from },
      action: { markRead: true },
      dry_run: false
    })
    expect(payload(result)).toMatchObject({ created: true })
    expect(client.users.settings.filters.create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { criteria: { from: proposed.criteria.from }, action: { removeLabelIds: ['UNREAD'] } }
    })
    client.users.settings.filters.list.mockResolvedValue({
      data: {
        filter: [{ id: 'read', criteria: { from: proposed.criteria.from }, action: { removeLabelIds: ['UNREAD'] } }]
      }
    })
    expect(
      payload(
        await createFilter(cfg, {
          criteria: { from: proposed.criteria.from },
          action: { markRead: true },
          dry_run: false
        })
      )
    ).toMatchObject({ created: false, existingFilterId: 'read' })
  })

  it('reports a conflicting filter even if Gmail omits its id and actions', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.list.mockResolvedValue({
      data: { filter: [{ criteria: { from: proposed.criteria.from } }] }
    })
    const result = await createFilter(cfg, proposed)
    expect(result).toHaveProperty('isError', true)
    expect(result.content[0]?.text).toContain('unknown')
  })

  it('previews an existing equivalent filter without requiring its id', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.list.mockResolvedValue({
      data: {
        filter: [
          {
            criteria: { from: proposed.criteria.from },
            action: { addLabelIds: ['Label_123'], removeLabelIds: ['INBOX', 'UNREAD'] }
          }
        ]
      }
    })
    expect(payload(await createFilter(cfg, proposed))).toMatchObject({ created: false, existingFilterId: null })
  })

  it('handles a Gmail response with no filter array and a create failure', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.list.mockResolvedValue({ data: {} })
    client.users.settings.filters.create.mockRejectedValue(new Error('create denied'))
    expect(await createFilter(cfg, { ...proposed, dry_run: false })).toHaveProperty('isError', true)
  })

  it('previews deletion and requires explicit live mode', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    const preview = await deleteFilter(cfg, { filterId: 'f1', dry_run: true })
    expect(payload(preview)).toMatchObject({ dry_run: true, deleted: false })
    expect(client.users.settings.filters.delete).not.toHaveBeenCalled()
    const live = await deleteFilter(cfg, { filterId: 'f1', dry_run: false })
    expect(payload(live)).toMatchObject({ dry_run: false, deleted: true })
    expect(client.users.settings.filters.delete).toHaveBeenCalledWith({ userId: 'me', id: 'f1' })
  })

  it('reports deletion API failure without claiming success', async () => {
    const client = gmail()
    service.mockReturnValue(client)
    client.users.settings.filters.delete.mockRejectedValue(new Error('delete denied'))
    expect(await deleteFilter(cfg, { filterId: 'f1', dry_run: false })).toHaveProperty('isError', true)
  })
})
