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
    attendees?: string[]
  }
) => {
  try {
    const calendar = calendarService(cfg.auth)
    const res = await calendar.events.insert({
      calendarId: calendarId ?? 'primary',
      requestBody: {
        summary,
        start: { dateTime: start },
        end: { dateTime: end },
        description,
        location,
        ...(attendees?.length ? { attendees: attendees.map((email) => ({ email })) } : {})
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
    attendees?: string[]
  }
) => {
  try {
    const calendar = calendarService(cfg.auth)
    // events.patch merges: only the fields present in the request body change.
    const requestBody: calendar_v3.Schema$Event = {}
    if (summary !== undefined) requestBody.summary = summary
    if (start !== undefined) requestBody.start = { dateTime: start }
    if (end !== undefined) requestBody.end = { dateTime: end }
    if (description !== undefined) requestBody.description = description
    if (location !== undefined) requestBody.location = location
    if (attendees !== undefined) requestBody.attendees = attendees.map((email) => ({ email }))
    const res = await calendar.events.patch({ calendarId: calendarId ?? 'primary', eventId, requestBody })
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
    if (dry_run) {
      // Look up the event so the caller sees what would be deleted.
      const res = await calendar.events.get({ calendarId: resolvedCalendarId, eventId })
      return jsonResult({ eventId, dry_run: true, deleted: false, would_delete: trimEvent(res.data) })
    }
    await calendar.events.delete({ calendarId: resolvedCalendarId, eventId })
    return jsonResult({ eventId, dry_run: false, deleted: true })
  } catch (err) {
    return errorResult('deleting event', err)
  }
}
