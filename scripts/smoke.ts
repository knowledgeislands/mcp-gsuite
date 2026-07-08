#!/usr/bin/env node
// End-to-end smoke test: boot the built server over stdio MCP, list its tools,
// and assert the surface matches what the registration tests expect. Catches
// drift between code and the *wire* contract (registration tests cover the
// in-process registration call pattern; this covers the actual protocol round-trip).
//
// Run via `bun run test:smoke` (builds dist/ first). Runs in CI without secrets:
// the server boots without MCP_GSUITE_CLIENT_ID / MCP_GSUITE_CLIENT_SECRET — it just warns.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Single source of truth for the tool surface — kept in sync with
// `tool-registration.test.ts`. If you add a tool, update both.
const EXPECTED_TOOLS = [
  'gsuite_auth_start',
  'gsuite_email_draft_create',
  'gsuite_email_draft_delete',
  'gsuite_email_draft_update',
  'gsuite_email_label_create',
  'gsuite_email_label_delete',
  'gsuite_email_label_update',
  'gsuite_email_message_archive',
  'gsuite_email_messages_batch_modify',
  'gsuite_email_message_label',
  'gsuite_email_message_mark_read',
  'gsuite_email_message_mark_unread',
  'gsuite_email_message_trash',
  'gsuite_email_message_unlabel',
  'gsuite_email_thread_archive',
  'gsuite_email_thread_label',
  'gsuite_email_thread_mark_read',
  'gsuite_email_thread_mark_unread',
  'gsuite_email_thread_trash',
  'gsuite_email_thread_unlabel',
  'gsuite_about',
  'gsuite_email_attachment_get',
  'gsuite_email_attachment_metadata',
  'gsuite_auth_status',
  'gsuite_email_draft_get',
  'gsuite_email_drafts_list',
  'gsuite_email_labels_list',
  'gsuite_email_message_get',
  'gsuite_email_message_raw',
  'gsuite_email_messages_search',
  'gsuite_email_thread_get',
  'gsuite_email_threads_search',
  'gsuite_drive_files_list',
  'gsuite_sheet_get',
  'gsuite_sheet_values_get',
  'gsuite_sheet_values_update',
  'gsuite_calendar_calendars_list',
  'gsuite_calendar_events_list',
  'gsuite_calendar_event_get',
  'gsuite_calendar_event_create',
  'gsuite_calendar_event_update',
  'gsuite_calendar_event_delete'
] as const

const die = (msg: string, detail?: unknown): never => {
  console.error(`✗ smoke failed: ${msg}`)
  if (detail !== undefined) console.error(detail)
  process.exit(1)
}

const main = async (): Promise<void> => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/mcp-server/index.js'],
    // Raise the access level to `destructive` so the smoke test sees the full
    // surface; the server's default (read only) would otherwise hide every
    // mutating gsuite_email_* tool.
    env: { ...(process.env as Record<string, string>), MCP_GSUITE_ACCESS_LEVEL: 'destructive' }
  })
  const client = new Client({ name: 'mcp-gsuite-smoke', version: '0.0.0' }, { capabilities: {} })

  await client.connect(transport)

  try {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    const expected = [...EXPECTED_TOOLS].sort()

    // Diff with clear messages so CI logs are actionable.
    const missing = expected.filter((n) => !names.includes(n))
    const extra = names.filter((n) => !expected.includes(n as (typeof EXPECTED_TOOLS)[number]))
    if (missing.length || extra.length) {
      die('tool surface mismatch', { missing, extra, actualCount: names.length, expectedCount: expected.length })
    }

    // Hard invariant: this server never exposes a `send` tool. Drafts only.
    const sendTools = names.filter((n) => /(_send_|_send$)/.test(n))
    if (sendTools.length) die('forbidden send tool(s) exposed', sendTools)

    // Sanity: every tool advertises an inputSchema object.
    const missingSchema = tools.filter((t) => !t.inputSchema || typeof t.inputSchema !== 'object').map((t) => t.name)
    if (missingSchema.length) die('tools missing inputSchema', missingSchema)

    console.error(`✓ smoke passed: ${names.length} tools listed, no send_* tools, all schemas present`)
  } finally {
    await client.close()
  }
}

main().catch((err) => die('uncaught', err))
