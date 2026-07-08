import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'
import { READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE } from '../../utils/annotations.js'
import { registerDriveTools } from './index.js'

const cfg = { auth: {} } as unknown as Config

describe('registerDriveTools', () => {
  it('registers the drive/sheets tools with the right names and annotations', () => {
    const registerTool = vi.fn()
    registerDriveTools({ registerTool } as unknown as McpServer, cfg)

    const registered = registerTool.mock.calls.map(([name, config]) => [name, config.annotations])
    expect(registered).toEqual([
      ['gsuite_drive_files_list', READ_ONLY_REMOTE],
      ['gsuite_sheet_get', READ_ONLY_REMOTE],
      ['gsuite_sheet_values_get', READ_ONLY_REMOTE],
      ['gsuite_sheet_values_update', WRITE_IDEMPOTENT_REMOTE]
    ])
  })
})
