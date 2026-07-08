import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { createEvent, deleteEvent, getEvent, listCalendars, listEvents, updateEvent } from '../../main/calendar/index.js'
import { DESTRUCTIVE_REMOTE, READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE, WRITE_REMOTE } from '../../utils/annotations.js'
import { shortTextSchema } from '../../utils/schemas.js'

// ── input schema primitives ──

// Calendar ids are email-shaped (`primary`, `foo@group.calendar.google.com`),
// so the Gmail idSchema alphabet is too narrow; length-capped free text.
const calendarIdSchema = shortTextSchema.min(1).describe('Calendar id (from `gsuite_calendar_calendars_list`); defaults to `primary`.')

// Event ids fit the base32hex-ish `[a-v0-9_]` alphabet; the shared idSchema
// alphabet is a superset, so reuse its shape here via a local pattern.
const eventIdSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_@.-]+$/, 'must contain only letters, digits, underscore, hyphen, dot, or @')
  .describe('Event id (from `gsuite_calendar_events_list`).')

// RFC 3339 timestamps for event start/end and window bounds.
const rfc3339Schema = shortTextSchema.min(1)

const emailSchema = z.string().min(3).max(320)

// ── output schemas ──
// Each mirrors the exact shape the matching main/calendar handler returns via
// jsonResult, so clients can validate structuredContent (workspace MCP §12,
// spec 2025-11-25 SHOULD). Defined inline in this coverage-excluded wiring layer.

const listCalendarsOutput = z.object({
  calendars: z.array(z.object({ id: z.string(), summary: z.string(), primary: z.boolean().optional() }))
})

// The trimmed event projection shared by list/get/create/update responses.
const eventRow = z.object({
  eventId: z.string(),
  summary: z.string(),
  start: z.string(),
  end: z.string(),
  status: z.string(),
  location: z.string().optional()
})

const listEventsOutput = z.object({ events: z.array(eventRow) })

const getEventOutput = eventRow.extend({
  description: z.string(),
  attendees: z.array(z.string())
})

// dry-run preview vs the actual delete confirmation. Modelled as one object
// (not a union) so the SDK can normalise it to an object outputSchema; the
// dry-run-only `would_delete` field is optional.
const deleteEventOutput = z.object({
  eventId: z.string(),
  dry_run: z.boolean(),
  deleted: z.boolean(),
  would_delete: eventRow.optional()
})

export const registerCalendarTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_calendar_calendars_list',
    {
      description: 'List the calendars on the user’s calendar list. Returns `{calendars: [{id, summary, primary?}]}`.',
      inputSchema: z.object({}).strict(),
      outputSchema: listCalendarsOutput,
      annotations: READ_ONLY_REMOTE
    },
    () => listCalendars(cfg)
  )

  server.registerTool(
    'gsuite_calendar_events_list',
    {
      description:
        'List events on a calendar, ordered by start time (recurring events are expanded into instances). Returns trimmed events `{id → eventId, summary, start, end, location?, status}`; `start`/`end` are RFC 3339 timestamps (or bare dates for all-day events).',
      inputSchema: z
        .object({
          calendarId: calendarIdSchema.optional(),
          timeMin: rfc3339Schema.optional().describe('Lower bound (exclusive) on end time, RFC 3339 (e.g. `2026-07-08T00:00:00Z`).'),
          timeMax: rfc3339Schema.optional().describe('Upper bound (exclusive) on start time, RFC 3339.'),
          query: shortTextSchema.min(1).optional().describe('Free-text search over event fields.'),
          maxResults: z.number().int().positive().max(2500).optional().describe('Max events to return (Calendar default 250, max 2500).')
        })
        .strict(),
      outputSchema: listEventsOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => listEvents(cfg, args)
  )

  server.registerTool(
    'gsuite_calendar_event_get',
    {
      description: 'Get a single event, including its description and attendee emails.',
      inputSchema: z
        .object({
          calendarId: calendarIdSchema.optional(),
          eventId: eventIdSchema
        })
        .strict(),
      outputSchema: getEventOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getEvent(cfg, args)
  )

  server.registerTool(
    'gsuite_calendar_event_create',
    {
      description:
        'Create an event. `start`/`end` are RFC 3339 timestamps (timed events; the calendar’s timezone applies when the offset is omitted). Attendees are invited by email. Returns the created event’s trimmed projection.',
      inputSchema: z
        .object({
          calendarId: calendarIdSchema.optional(),
          summary: shortTextSchema.min(1).describe('Event title.'),
          start: rfc3339Schema.describe('Start, RFC 3339 (e.g. `2026-07-09T10:00:00+01:00`).'),
          end: rfc3339Schema.describe('End, RFC 3339.'),
          description: shortTextSchema.optional(),
          location: shortTextSchema.optional(),
          attendees: z.array(emailSchema).min(1).optional().describe('Attendee email addresses.')
        })
        .strict(),
      outputSchema: eventRow,
      annotations: WRITE_REMOTE
    },
    (args) => createEvent(cfg, args)
  )

  server.registerTool(
    'gsuite_calendar_event_update',
    {
      description:
        'Update an event with patch semantics — only the fields provided change; passing `attendees` replaces the full attendee list. Returns the updated event’s trimmed projection.',
      inputSchema: z
        .object({
          calendarId: calendarIdSchema.optional(),
          eventId: eventIdSchema,
          summary: shortTextSchema.min(1).optional(),
          start: rfc3339Schema.optional().describe('New start, RFC 3339.'),
          end: rfc3339Schema.optional().describe('New end, RFC 3339.'),
          description: shortTextSchema.optional(),
          location: shortTextSchema.optional(),
          attendees: z.array(emailSchema).optional().describe('Replacement attendee email list (empty array clears attendees).')
        })
        .strict(),
      outputSchema: eventRow,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => updateEvent(cfg, args)
  )

  server.registerTool(
    'gsuite_calendar_event_delete',
    {
      description:
        'Delete an event. Attendees are notified per the calendar’s defaults. `dry_run` defaults to true — callers must pass `dry_run: false` to actually delete; dry-run fetches the event and returns its trimmed projection in `would_delete` without calling the delete API.',
      inputSchema: z
        .object({
          calendarId: calendarIdSchema.optional(),
          eventId: eventIdSchema,
          dry_run: z.boolean().default(true).describe('Preview only; do not delete. Default true — pass false to actually delete.')
        })
        .strict(),
      outputSchema: deleteEventOutput,
      annotations: DESTRUCTIVE_REMOTE
    },
    (args) => deleteEvent(cfg, args)
  )
}
