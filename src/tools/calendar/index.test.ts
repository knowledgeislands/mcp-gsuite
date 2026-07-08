import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'
import { DESTRUCTIVE_REMOTE, READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE, WRITE_REMOTE } from '../../utils/annotations.js'
import { registerCalendarTools } from './index.js'

const cfg = { auth: {} } as unknown as Config

describe('registerCalendarTools', () => {
  it('registers the calendar tools with the right names and annotations', () => {
    const registerTool = vi.fn()
    registerCalendarTools({ registerTool } as unknown as McpServer, cfg)

    const registered = registerTool.mock.calls.map(([name, config]) => [name, config.annotations])
    expect(registered).toEqual([
      ['gsuite_calendar_calendars_list', READ_ONLY_REMOTE],
      ['gsuite_calendar_events_list', READ_ONLY_REMOTE],
      ['gsuite_calendar_event_get', READ_ONLY_REMOTE],
      ['gsuite_calendar_event_create', WRITE_REMOTE],
      ['gsuite_calendar_event_update', WRITE_IDEMPOTENT_REMOTE],
      ['gsuite_calendar_event_delete', DESTRUCTIVE_REMOTE]
    ])
  })
})
