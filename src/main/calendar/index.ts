/**
 * Calendar operations against the Calendar v3 API. Each entry point takes the
 * loaded `Config` as its first argument and obtains an authenticated Calendar
 * client via `calendarService(cfg.auth)`.
 */
import type { calendar_v3 } from 'googleapis'
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { calendarService } from '../google-client/index.js'

/**
 * Project a Calendar event down to the fields the tools return. `start`/`end`
 * collapse the API's `{dateTime}` / all-day `{date}` alternatives to a single
 * string; `location` appears only when the event has one.
 */
const trimEvent = (e: calendar_v3.Schema$Event) => ({
  eventId: e.id ?? '',
  summary: e.summary ?? '',
  start: e.start?.dateTime ?? e.start?.date ?? '',
  end: e.end?.dateTime ?? e.end?.date ?? '',
  status: e.status ?? '',
  ...(e.location ? { location: e.location } : {})
})

export const listCalendars = async (cfg: Config) => {
  try {
    const calendar = calendarService(cfg.auth)
    const res = await calendar.calendarList.list()
    const calendars = (res.data.items ?? []).map((c) => ({
      id: c.id ?? '',
      summary: c.summary ?? '',
      ...(c.primary ? { primary: true } : {})
    }))
    // Wrapped in an object (not a bare array) so structuredContent is a valid
    // JSON object per the MCP spec, matching the outputSchema.
    return jsonResult({ calendars })
  } catch (err) {
    return errorResult('listing calendars', err)
  }
}

export const listEvents = async (
  cfg: Config,
  {
    calendarId,
    timeMin,
    timeMax,
    query,
    maxResults
  }: { calendarId?: string; timeMin?: string; timeMax?: string; query?: string; maxResults?: number }
) => {
  try {
    const calendar = calendarService(cfg.auth)
    // singleEvents expands recurring series into instances, which is what
    // orderBy=startTime requires — and what callers scanning a window want.
    const res = await calendar.events.list({
      calendarId: calendarId ?? 'primary',
      timeMin,
      timeMax,
      q: query,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    })
    const events = (res.data.items ?? []).map(trimEvent)
    return jsonResult({ events })
  } catch (err) {
    return errorResult('listing events', err)
  }
}

export const getEvent = async (cfg: Config, { calendarId, eventId }: { calendarId?: string; eventId: string }) => {
  try {
    const calendar = calendarService(cfg.auth)
    const res = await calendar.events.get({ calendarId: calendarId ?? 'primary', eventId })
    return jsonResult({
      ...trimEvent(res.data),
      description: res.data.description ?? '',
      attendees: (res.data.attendees ?? []).map((a) => a.email ?? '')
    })
  } catch (err) {
    return errorResult('getting event', err)
  }
}

/**
 * The server is draft-only, so no calendar write may notify anyone. Every write
 * passes `sendUpdates: 'none'`, and because Google documents that some emails
 * may still be sent and that a guest's calendar shows the change regardless,
 * the writes also stay off meetings altogether: an event is created without
 * guests, and an update or delete is refused for any event that has attendees
 * or that this calendar did not organise.
 */
const NO_UPDATES = { sendUpdates: 'none' } as const

export const ATTENDEES_REFUSED =
  'Attendees are not supported: this server never sends calendar invitations. Create the event without attendees and invite people from Google Calendar.'

const isMeeting = (event: calendar_v3.Schema$Event): boolean =>
  event.organizer?.self !== true || (event.attendees?.length ?? 0) > 0

const meetingRefused = (eventId: string, event: calendar_v3.Schema$Event, verb: string) =>
  new Error(
    `Refused: event ${eventId} ("${event.summary ?? ''}") is a meeting, and ${verb} it would notify its attendees or organiser. This server never sends; change it in Google Calendar instead.`
  )

export const createEvent = async (
  cfg: Config,
  {
    calendarId,
    summary,
    start,
    end,
    description,
    location,
    attendees
  }: {
    calendarId?: string
    summary: string
    start: string
    end: string
    description?: string
    location?: string
    attendees?: unknown
  }
) => {
  if (attendees !== undefined && (!Array.isArray(attendees) || attendees.length > 0))
    return errorResult('creating event', new Error(ATTENDEES_REFUSED))
  try {
    const calendar = calendarService(cfg.auth)
    const res = await calendar.events.insert({
      calendarId: calendarId ?? 'primary',
      ...NO_UPDATES,
      requestBody: {
        summary,
        start: { dateTime: start },
        end: { dateTime: end },
        description,
        location
      }
    })
    return jsonResult(trimEvent(res.data))
  } catch (err) {
    return errorResult('creating event', err)
  }
}

export const updateEvent = async (
  cfg: Config,
  {
    calendarId,
    eventId,
    summary,
    start,
    end,
    description,
    location,
    attendees
  }: {
    calendarId?: string
    eventId: string
    summary?: string
    start?: string
    end?: string
    description?: string
    location?: string
    attendees?: unknown
  }
) => {
  if (attendees !== undefined) return errorResult('updating event', new Error(ATTENDEES_REFUSED))
  try {
    const calendar = calendarService(cfg.auth)
    const resolvedCalendarId = calendarId ?? 'primary'
    const current = await calendar.events.get({ calendarId: resolvedCalendarId, eventId })
    if (isMeeting(current.data)) throw meetingRefused(eventId, current.data, 'changing')
    // events.patch merges: only the fields present in the request body change.
    const requestBody: calendar_v3.Schema$Event = {}
    if (summary !== undefined) requestBody.summary = summary
    if (start !== undefined) requestBody.start = { dateTime: start }
    if (end !== undefined) requestBody.end = { dateTime: end }
    if (description !== undefined) requestBody.description = description
    if (location !== undefined) requestBody.location = location
    const res = await calendar.events.patch({ calendarId: resolvedCalendarId, eventId, ...NO_UPDATES, requestBody })
    return jsonResult(trimEvent(res.data))
  } catch (err) {
    return errorResult('updating event', err)
  }
}

export const deleteEvent = async (
  cfg: Config,
  { calendarId, eventId, dry_run }: { calendarId?: string; eventId: string; dry_run: boolean }
) => {
  try {
    const calendar = calendarService(cfg.auth)
    const resolvedCalendarId = calendarId ?? 'primary'
    // Look up the event first, in a preview and a live call alike: the caller
    // sees what would be deleted, and a meeting is refused before any delete.
    const res = await calendar.events.get({ calendarId: resolvedCalendarId, eventId })
    if (isMeeting(res.data)) throw meetingRefused(eventId, res.data, 'deleting')
    if (dry_run) return jsonResult({ eventId, dry_run: true, deleted: false, would_delete: trimEvent(res.data) })
    await calendar.events.delete({ calendarId: resolvedCalendarId, eventId, ...NO_UPDATES })
    return jsonResult({ eventId, dry_run: false, deleted: true })
  } catch (err) {
    return errorResult('deleting event', err)
  }
}
