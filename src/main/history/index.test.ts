import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'
import { gmailService } from '../google-client/index.js'
import { historyCheckpoint, historyList } from './index.js'

vi.mock('../google-client/index.js', () => ({ gmailService: vi.fn() }))

const service = vi.mocked(gmailService)
const profile = vi.fn()
const list = vi.fn()
const cfg = { auth: {} } as Config

beforeEach(() => {
  service.mockReset()
  profile.mockReset()
  list.mockReset()
  service.mockReturnValue({ users: { getProfile: profile, history: { list } } } as unknown as ReturnType<
    typeof gmailService
  >)
})

describe('historyCheckpoint', () => {
  it('returns the exact mailbox-level decimal ID without profile fields', async () => {
    profile.mockResolvedValue({ data: { historyId: '900719925474099312345', emailAddress: 'private@example.com' } })
    const result = await historyCheckpoint(cfg)
    expect(profile).toHaveBeenCalledExactlyOnceWith({ userId: 'me' })
    expect(result).toHaveProperty('structuredContent', { historyId: '900719925474099312345' })
  })

  it('rejects a missing checkpoint rather than inventing one', async () => {
    profile.mockResolvedValue({ data: {} })
    const result = await historyCheckpoint(cfg)
    expect(result).toHaveProperty('isError', true)
  })

  it('maps a provider error through the standard envelope', async () => {
    profile.mockRejectedValue(new Error('provider failed'))
    const result = await historyCheckpoint(cfg)
    expect(result.content[0]?.text).toContain('provider failed')
  })
})

describe('historyList', () => {
  it('preserves each event type, exact IDs, and a returned continuation token', async () => {
    list.mockResolvedValue({
      data: {
        historyId: '900719925474099399999',
        nextPageToken: 'next-page',
        history: [
          {
            id: '900719925474099312346',
            messages: [{ id: 'm1', threadId: 't1' }],
            messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }],
            messagesDeleted: [{ message: { id: 'm2', threadId: 't2' } }],
            labelsAdded: [{ message: { id: 'm1' }, labelIds: ['STARRED'] }],
            labelsRemoved: [{ message: { id: 'm1' }, labelIds: ['UNREAD'] }]
          }
        ]
      }
    })
    const result = await historyList(cfg, {
      startHistoryId: '900719925474099312345',
      maxResults: 500,
      pageToken: 'previous-page'
    })
    expect(list).toHaveBeenCalledExactlyOnceWith({
      userId: 'me',
      startHistoryId: '900719925474099312345',
      maxResults: 500,
      pageToken: 'previous-page'
    })
    expect(result).toHaveProperty('structuredContent', {
      historyId: '900719925474099399999',
      nextPageToken: 'next-page',
      history: [
        {
          id: '900719925474099312346',
          messages: [{ id: 'm1', threadId: 't1' }],
          messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }],
          messagesDeleted: [{ message: { id: 'm2', threadId: 't2' } }],
          labelsAdded: [{ message: { id: 'm1' }, labelIds: ['STARRED'] }],
          labelsRemoved: [{ message: { id: 'm1' }, labelIds: ['UNREAD'] }]
        }
      ]
    })
  })

  it('returns an empty page with the mailbox checkpoint', async () => {
    list.mockResolvedValue({ data: { historyId: '900719925474099312345' } })
    const result = await historyList(cfg, { startHistoryId: '900719925474099312344' })
    expect(result).toHaveProperty('structuredContent', { historyId: '900719925474099312345', history: [] })
  })

  it('defaults absent event arrays without losing the event ID', async () => {
    list.mockResolvedValue({ data: { historyId: '8', history: [{ id: '7' }] } })
    const result = await historyList(cfg, { startHistoryId: '6' })
    expect(result).toHaveProperty('structuredContent', {
      historyId: '8',
      history: [{ id: '7', messagesAdded: [], messagesDeleted: [], labelsAdded: [], labelsRemoved: [] }]
    })
  })

  it('requires resynchronization after a provider 404', async () => {
    list.mockRejectedValue({ response: { status: 404, data: { error: { message: 'not found' } } } })
    const result = await historyList(cfg, { startHistoryId: '1' })
    expect(result).toHaveProperty('isError', true)
    expect(result.content[0]?.text).toContain('full search')
    expect(result.content[0]?.text).toContain('drain all history pages')
  })

  it('maps other provider failures without resetting the cursor', async () => {
    list.mockRejectedValue(new Error('provider failed'))
    const result = await historyList(cfg, { startHistoryId: '1' })
    expect(result.content[0]?.text).toContain('provider failed')
  })

  it('rejects malformed provider IDs rather than coercing to a number or false checkpoint', async () => {
    list.mockResolvedValue({ data: { historyId: 42 } })
    const result = await historyList(cfg, { startHistoryId: '1' })
    expect(result).toHaveProperty('isError', true)
  })
})
