#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
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

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`${SERVER_NAME} ready`)
}

main().catch((error: Error) => {
  console.error(`Connection error: ${error.message}`)
  process.exit(1)
})
