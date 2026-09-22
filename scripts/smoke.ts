#!/usr/bin/env node
// End-to-end smoke test: boot the built server over stdio MCP, list its tools,
// and assert the surface matches what the registration tests expect. Catches
// drift between code and the *wire* contract (registration tests cover the
// in-process registration call pattern; this covers the actual protocol round-trip).
//
// It is also the repository's protocol-profile boundary: the MCP 2026-07-28
// server profile puts `server/discover`, protocol stamping, and cache defaults
// inside the SDK, so no source-level literal proves them. Only a live round
// trip does, which is why the era, the negotiated version, the discovery
// envelope, and the deliberate legacy fallback are asserted here rather than
// in a unit test.
//
// Run via `bun run ki:test:smoke` (builds dist/ first). Runs in CI without secrets:
// the server boots without MCP_GSUITE_CLIENT_ID / MCP_GSUITE_CLIENT_SECRET — it just warns.

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

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

const createTransport = (): StdioClientTransport =>
  new StdioClientTransport({
    command: 'node',
    args: ['dist/mcp-server/index.js'],
    // Raise the access level to `destructive` so the smoke test sees the full
    // surface; the server's default (read only) would otherwise hide every
    // mutating gsuite_email_* tool.
    env: { ...(process.env as Record<string, string>), MCP_GSUITE_ACCESS_LEVEL: 'destructive' }
  })

const main = async (): Promise<void> => {
  const client = new Client(
    { name: 'mcp-gsuite-smoke', version: '0.0.0' },
    { capabilities: {}, versionNegotiation: { mode: 'auto' } }
  )

  await client.connect(createTransport())

  try {
    // Protocol profile: the SDK owns server/discover, so this round trip is
    // the only place the modern era and its stamped version are provable.
    const discovery = client.getDiscoverResult()
    if (client.getProtocolEra() !== 'modern') die('server/discover did not select the modern protocol era')
    if (client.getNegotiatedProtocolVersion() !== '2026-07-28') {
      die('unexpected negotiated protocol version', client.getNegotiatedProtocolVersion())
    }
    if (
      discovery?.resultType !== 'complete' ||
      !discovery.supportedVersions.includes('2026-07-28') ||
      discovery._meta?.['io.modelcontextprotocol/serverInfo']?.name !== 'mcp-gsuite'
    ) {
      die('invalid server/discover result', discovery)
    }

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

    // A schema violation must come back inside the result envelope as a Tool
    // Execution Error, not as a JSON-RPC protocol error: the model can only
    // self-correct from the former. `messageId` is a string, so a number is
    // rejected by validation before any Google credential is needed.
    const malformed = await client.callTool({ name: 'gsuite_email_message_get', arguments: { messageId: 7 } })
    if (!malformed.isError) die('malformed tool arguments were accepted', malformed)

    // Deliberate compatibility fallback: a client that opens with the 2025-era
    // handshake is still served, and sees exactly the same tool surface. This
    // assertion is what stops `legacy: 'serve'` being dropped by accident.
    const legacyClient = new Client({ name: 'mcp-gsuite-legacy-smoke', version: '0.0.0' }, { capabilities: {} })
    await legacyClient.connect(createTransport())
    try {
      if (legacyClient.getProtocolEra() !== 'legacy') {
        die('legacy initialize fallback did not remain available', legacyClient.getProtocolEra())
      }
      const legacyNames = (await legacyClient.listTools()).tools.map((t) => t.name).sort()
      if (legacyNames.join(',') !== names.join(',')) {
        die('legacy tool surface differs from modern tool surface', { legacyNames, names })
      }
    } finally {
      await legacyClient.close()
    }

    console.error(
      `✓ smoke passed: modern discovery, legacy fallback, ${names.length} tools listed, no send_* tools, all schemas present`
    )
  } finally {
    await client.close()
  }
}

main().catch((err) => die('uncaught', err))
