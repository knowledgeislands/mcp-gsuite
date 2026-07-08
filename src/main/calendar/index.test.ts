import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  calendarService: vi.fn()
}))

const client = await import('../google-client/index.js')
const { createEvent, deleteEvent, getEvent, listCalendars, listEvents, updateEvent } = await import('./index.js')

const calendarServiceMock = client.calendarService as ReturnType<typeof vi.fn>

// Config is injected; only the slices these handlers read need to be present.
const cfg = { auth: {} } as unknown as Config

const makeCalendar = () => ({
  calendarList: {
    list: vi.fn()
  },
  events: {
    list: vi.fn(),
    get: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
})

beforeEach(() => {
  calendarServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listCalendars', () => {
  it('returns {id, summary} rows, marking the primary calendar', async () => {
    const calendar = makeCalendar()
    calendar.calendarList.list.mockResolvedValue({
      data: {
        items: [
          { id: 'kris@kris.me.uk', summary: 'Kris', primary: true },
          { id: 'team@group.calendar.google.com', summary: 'Team' }
        ]
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await listCalendars(cfg)
    expect(JSON.parse(r.content[0].text)).toEqual({
      calendars: [
        { id: 'kris@kris.me.uk', summary: 'Kris', primary: true },
        { id: 'team@group.calendar.google.com', summary: 'Team' }
      ]
    })
    expect(calendar.calendarList.list).toHaveBeenCalledWith()
  })

  it('handles a missing items array and defaults missing id/summary', async () => {
    const calendar = makeCalendar()
    calendar.calendarList.list.mockResolvedValueOnce({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    const empty = await listCalendars(cfg)
    expect(JSON.parse(empty.content[0].text)).toEqual({ calendars: [] })

    calendar.calendarList.list.mockResolvedValueOnce({ data: { items: [{}] } })
    const sparse = await listCalendars(cfg)
    expect(JSON.parse(sparse.content[0].text)).toEqual({ calendars: [{ id: '', summary: '' }] })
  })

  it('returns an error result when the Calendar API throws', async () => {
    const calendar = makeCalendar()
    calendar.calendarList.list.mockRejectedValue({
      response: { status: 401, data: { error: { message: 'Invalid Credentials' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await listCalendars(cfg)
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe(
      'Error listing calendars: HTTP 401: Invalid Credentials — Run the `gsuite_auth_start` tool to refresh the OAuth token.'
    )
  })

  it('returns an error result when calendarService itself throws (no token)', async () => {
    calendarServiceMock.mockImplementation(() => {
      throw new Error('No tokens found at /tmp/x')
    })

    const r = await listCalendars(cfg)
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toMatch(/No tokens found/)
  })
})

describe('listEvents', () => {
  it('lists trimmed events on the primary calendar by default (singleEvents, ordered by start)', async () => {
    const calendar = makeCalendar()
    calendar.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'e1',
            summary: 'Standup',
            start: { dateTime: '2026-07-08T09:00:00Z' },
            end: { dateTime: '2026-07-08T09:15:00Z' },
            status: 'confirmed',
            location: 'Meet'
          },
          // All-day event: start/end carry `date`, no location.
          { id: 'e2', summary: 'Holiday', start: { date: '2026-07-09' }, end: { date: '2026-07-10' }, status: 'confirmed' }
        ]
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await listEvents(cfg, {})
    expect(JSON.parse(r.content[0].text)).toEqual({
      events: [
        {
          eventId: 'e1',
          summary: 'Standup',
          start: '2026-07-08T09:00:00Z',
          end: '2026-07-08T09:15:00Z',
          status: 'confirmed',
          location: 'Meet'
        },
        { eventId: 'e2', summary: 'Holiday', start: '2026-07-09', end: '2026-07-10', status: 'confirmed' }
      ]
    })
    expect(calendar.events.list).toHaveBeenCalledWith({
      calendarId: 'primary',
      timeMin: undefined,
      timeMax: undefined,
      q: undefined,
      maxResults: undefined,
      singleEvents: true,
      orderBy: 'startTime'
    })
  })

  it('passes window, query, maxResults, and an explicit calendarId through', async () => {
    const calendar = makeCalendar()
    calendar.events.list.mockResolvedValue({ data: { items: [] } })
    calendarServiceMock.mockReturnValue(calendar)

    await listEvents(cfg, {
      calendarId: 'team@group.calendar.google.com',
      timeMin: '2026-07-01T00:00:00Z',
      timeMax: '2026-08-01T00:00:00Z',
      query: 'review',
      maxResults: 10
    })
    expect(calendar.events.list).toHaveBeenCalledWith({
      calendarId: 'team@group.calendar.google.com',
      timeMin: '2026-07-01T00:00:00Z',
      timeMax: '2026-08-01T00:00:00Z',
      q: 'review',
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    })
  })

  it('handles a missing items array and defaults sparse event fields', async () => {
    const calendar = makeCalendar()
    calendar.events.list.mockResolvedValueOnce({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    const empty = await listEvents(cfg, {})
    expect(JSON.parse(empty.content[0].text)).toEqual({ events: [] })

    calendar.events.list.mockResolvedValueOnce({ data: { items: [{}] } })
    const sparse = await listEvents(cfg, {})
    expect(JSON.parse(sparse.content[0].text)).toEqual({
      events: [{ eventId: '', summary: '', start: '', end: '', status: '' }]
    })
  })

  it('returns an error result when the Calendar API throws', async () => {
    const calendar = makeCalendar()
    calendar.events.list.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await listEvents(cfg, { calendarId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error listing events: HTTP 404: Not Found')
  })
})

describe('getEvent', () => {
  it('returns the trimmed event plus description and attendee emails', async () => {
    const calendar = makeCalendar()
    calendar.events.get.mockResolvedValue({
      data: {
        id: 'e1',
        summary: 'Planning',
        start: { dateTime: '2026-07-08T10:00:00Z' },
        end: { dateTime: '2026-07-08T11:00:00Z' },
        status: 'confirmed',
        location: 'Room 4',
        description: 'Quarterly planning.',
        attendees: [{ email: 'a@example.com' }, {}]
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await getEvent(cfg, { eventId: 'e1' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      eventId: 'e1',
      summary: 'Planning',
      start: '2026-07-08T10:00:00Z',
      end: '2026-07-08T11:00:00Z',
      status: 'confirmed',
      location: 'Room 4',
      description: 'Quarterly planning.',
      attendees: ['a@example.com', '']
    })
    expect(calendar.events.get).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'e1' })
  })

  it('uses an explicit calendarId and defaults description/attendees when absent', async () => {
    const calendar = makeCalendar()
    calendar.events.get.mockResolvedValue({ data: { id: 'e1' } })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await getEvent(cfg, { calendarId: 'other@example.com', eventId: 'e1' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      eventId: 'e1',
      summary: '',
      start: '',
      end: '',
      status: '',
      description: '',
      attendees: []
    })
    expect(calendar.events.get).toHaveBeenCalledWith({ calendarId: 'other@example.com', eventId: 'e1' })
  })

  it('returns an error result on 404', async () => {
    const calendar = makeCalendar()
    calendar.events.get.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await getEvent(cfg, { eventId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error getting event: HTTP 404: Not Found')
  })
})

describe('createEvent', () => {
  it('creates the event with attendees and returns the trimmed projection', async () => {
    const calendar = makeCalendar()
    calendar.events.insert.mockResolvedValue({
      data: {
        id: 'new1',
        summary: 'Sync',
        start: { dateTime: '2026-07-09T10:00:00Z' },
        end: { dateTime: '2026-07-09T10:30:00Z' },
        status: 'confirmed'
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await createEvent(cfg, {
      summary: 'Sync',
      start: '2026-07-09T10:00:00Z',
      end: '2026-07-09T10:30:00Z',
      description: 'Weekly sync',
      location: 'Meet',
      attendees: ['a@example.com', 'b@example.com']
    })
    expect(JSON.parse(r.content[0].text)).toEqual({
      eventId: 'new1',
      summary: 'Sync',
      start: '2026-07-09T10:00:00Z',
      end: '2026-07-09T10:30:00Z',
      status: 'confirmed'
    })
    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: {
        summary: 'Sync',
        start: { dateTime: '2026-07-09T10:00:00Z' },
        end: { dateTime: '2026-07-09T10:30:00Z' },
        description: 'Weekly sync',
        location: 'Meet',
        attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }]
      }
    })
  })

  it('omits the attendees field when none are given and honours an explicit calendarId', async () => {
    const calendar = makeCalendar()
    calendar.events.insert.mockResolvedValue({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    await createEvent(cfg, { calendarId: 'other@example.com', summary: 'Solo', start: 's', end: 'e' })
    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: 'other@example.com',
      requestBody: {
        summary: 'Solo',
        start: { dateTime: 's' },
        end: { dateTime: 'e' },
        description: undefined,
        location: undefined
      }
    })
  })

  it('returns an error result when the Calendar API rejects the event', async () => {
    const calendar = makeCalendar()
    calendar.events.insert.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'The specified time range is invalid.' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await createEvent(cfg, { summary: 'Bad', start: 'x', end: 'y' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error creating event: HTTP 400: The specified time range is invalid.')
  })
})

describe('updateEvent', () => {
  it('patches only the provided fields and returns the trimmed projection', async () => {
    const calendar = makeCalendar()
    calendar.events.patch.mockResolvedValue({
      data: {
        id: 'e1',
        summary: 'Renamed',
        start: { dateTime: '2026-07-09T10:00:00Z' },
        end: { dateTime: '2026-07-09T11:00:00Z' },
        status: 'confirmed'
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await updateEvent(cfg, { eventId: 'e1', summary: 'Renamed' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      eventId: 'e1',
      summary: 'Renamed',
      start: '2026-07-09T10:00:00Z',
      end: '2026-07-09T11:00:00Z',
      status: 'confirmed'
    })
    expect(calendar.events.patch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'e1',
      requestBody: { summary: 'Renamed' }
    })
  })

  it('maps every mutable field into the patch body (explicit calendarId, attendees replaced)', async () => {
    const calendar = makeCalendar()
    calendar.events.patch.mockResolvedValue({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    await updateEvent(cfg, {
      calendarId: 'other@example.com',
      eventId: 'e1',
      summary: 'S',
      start: '2026-07-09T10:00:00Z',
      end: '2026-07-09T11:00:00Z',
      description: 'D',
      location: 'L',
      attendees: ['a@example.com']
    })
    expect(calendar.events.patch).toHaveBeenCalledWith({
      calendarId: 'other@example.com',
      eventId: 'e1',
      requestBody: {
        summary: 'S',
        start: { dateTime: '2026-07-09T10:00:00Z' },
        end: { dateTime: '2026-07-09T11:00:00Z' },
        description: 'D',
        location: 'L',
        attendees: [{ email: 'a@example.com' }]
      }
    })
  })

  it('sends an empty patch body when no mutable fields are provided', async () => {
    const calendar = makeCalendar()
    calendar.events.patch.mockResolvedValue({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    await updateEvent(cfg, { eventId: 'e1' })
    expect(calendar.events.patch).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'e1', requestBody: {} })
  })

  it('returns an error result on 404', async () => {
    const calendar = makeCalendar()
    calendar.events.patch.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Not Found' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await updateEvent(cfg, { eventId: 'nope', summary: 'X' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error updating event: HTTP 404: Not Found')
  })
})

describe('deleteEvent', () => {
  it('deletes the event and returns {eventId, deleted: true} when dry_run is false', async () => {
    const calendar = makeCalendar()
    calendar.events.delete.mockResolvedValue({ data: {} })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await deleteEvent(cfg, { eventId: 'e1', dry_run: false })
    expect(JSON.parse(r.content[0].text)).toEqual({ eventId: 'e1', dry_run: false, deleted: true })
    expect(calendar.events.delete).toHaveBeenCalledWith({ calendarId: 'primary', eventId: 'e1' })
  })

  it('returns a preview without calling delete when dry_run is true (explicit calendarId)', async () => {
    const calendar = makeCalendar()
    calendar.events.get.mockResolvedValue({
      data: {
        id: 'e1',
        summary: 'Doomed',
        start: { dateTime: '2026-07-09T10:00:00Z' },
        end: { dateTime: '2026-07-09T11:00:00Z' },
        status: 'confirmed'
      }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await deleteEvent(cfg, { calendarId: 'other@example.com', eventId: 'e1', dry_run: true })
    expect(JSON.parse(r.content[0].text)).toEqual({
      eventId: 'e1',
      dry_run: true,
      deleted: false,
      would_delete: {
        eventId: 'e1',
        summary: 'Doomed',
        start: '2026-07-09T10:00:00Z',
        end: '2026-07-09T11:00:00Z',
        status: 'confirmed'
      }
    })
    expect(calendar.events.get).toHaveBeenCalledWith({ calendarId: 'other@example.com', eventId: 'e1' })
    expect(calendar.events.delete).not.toHaveBeenCalled()
  })

  it('returns an error result on 410 (already deleted)', async () => {
    const calendar = makeCalendar()
    calendar.events.delete.mockRejectedValue({
      response: { status: 410, data: { error: { message: 'Resource has been deleted' } } }
    })
    calendarServiceMock.mockReturnValue(calendar)

    const r = await deleteEvent(cfg, { eventId: 'gone', dry_run: false })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error deleting event: HTTP 410: Resource has been deleted')
  })
})
