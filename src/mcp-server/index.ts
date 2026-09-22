#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { loadConfig, SERVER_NAME, SERVER_VERSION } from '../config/index.js'
import {
  registerAttachmentTools,
  registerAuthTools,
  registerCalendarTools,
  registerDraftTools,
  registerDriveTools,
  registerLabelTools,
  registerMessageTools,
  registerThreadTools
} from '../tools/index.js'
import { makeAccessGatedRegister } from '../utils/access-level.js'

const config = loadConfig()

console.error(`${SERVER_NAME} v${SERVER_VERSION} starting...`)
console.error(`  MCP_GSUITE_ACCESS_LEVEL=${config.accessLevel}`)
console.error(`  token store : ${config.auth.tokenStorePath}`)
console.error(`  auth server : ${config.auth.authServerUrl}`)
console.error(`  scopes      : ${config.auth.scopes.join(' ')}`)
console.error(
  `  audit log   : MCP_GSUITE_AUDIT_LOG=${config.auditLogMode}${config.auditLogMode === 'off' ? '' : ` (path: ${config.auditLogPath})`}`
)
if (!config.auth.clientId || !config.auth.clientSecret) {
  console.error('  WARNING: MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET are not set.')
}

// One fully-registered server per connection. `serveStdio` owns the era
// decision for the opening exchange and pins exactly one instance from this
// factory for that connection's lifetime, so registration must be complete
// before the instance is returned and must not depend on connection state.
const createServer = (): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  server.registerTool = makeAccessGatedRegister(server, config.accessLevel, {
    mode: config.auditLogMode,
    path: config.auditLogPath,
    maxBytes: config.auditLogMaxBytes,
    keep: config.auditLogKeep
  })

  registerAuthTools(server, config)
  registerLabelTools(server, config)
  registerMessageTools(server, config)
  registerAttachmentTools(server, config)
  registerThreadTools(server, config)
  registerDriveTools(server, config)
  registerCalendarTools(server, config)
  registerDraftTools(server, config)
  return server
}

// `legacy: 'serve'` is deliberate: a client still opening with a 2025-era
// `initialize` is served from the same factory rather than rejected, so the
// tool surface stays reachable while the fleet migrates. This remains a
// modern-profile server; the smoke test asserts both eras.
const handle = serveStdio(createServer, {
  legacy: 'serve',
  onerror: (error) => console.error(`${SERVER_NAME} stdio error:`, error)
})

console.error(`${SERVER_NAME} ready`)

process.on('SIGINT', async () => {
  await handle.close()
  process.exit(0)
})
