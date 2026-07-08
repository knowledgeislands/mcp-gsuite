import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { listFiles } from '../../main/drive-client/index.js'
import { getSheet, getValues, updateValues } from '../../main/sheets-client/index.js'
import { READ_ONLY_REMOTE, WRITE_IDEMPOTENT_REMOTE } from '../../utils/annotations.js'
import { idSchema, shortTextSchema } from '../../utils/schemas.js'

// ── output schemas ──
// Each mirrors the exact shape the matching main/drive-client or
// main/sheets-client handler returns via jsonResult, so clients can validate
// structuredContent (workspace MCP §12, spec 2025-11-25 SHOULD). Defined inline
// in this coverage-excluded wiring layer, matching the sibling convention.

// gsuite_drive_files_list returns { files: [...] } — wrapped in an object (not
// a bare array) so structuredContent is a valid JSON object per the spec.
const listFilesOutput = z.object({
  files: z.array(z.object({ id: z.string(), name: z.string(), mimeType: z.string(), modifiedTime: z.string() }))
})

const getSheetOutput = z.object({
  title: z.string(),
  sheets: z.array(z.object({ sheetId: z.number(), title: z.string(), rowCount: z.number(), columnCount: z.number() }))
})

const getValuesOutput = z.object({
  range: z.string(),
  values: z.array(z.array(z.string()))
})

const updateValuesOutput = z.object({
  updatedRange: z.string(),
  updatedCells: z.number(),
  updatedRows: z.number(),
  updatedColumns: z.number()
})

// A1-notation ranges (`Sheet1!A1:C10`) are free-form but short.
const rangeSchema = shortTextSchema.min(1).describe('A1-notation range, e.g. `Sheet1!A1:C10`.')

export const registerDriveTools = (server: McpServer, cfg: Config): void => {
  server.registerTool(
    'gsuite_drive_files_list',
    {
      description:
        'List files in a Drive folder (trashed files excluded). Returns `{files: [{id, name, mimeType, modifiedTime}]}`. Filter by a name substring and/or an exact MIME type (e.g. `application/vnd.google-apps.spreadsheet`).',
      inputSchema: z
        .object({
          folderId: idSchema.describe('Drive folder id (`root` for My Drive root).'),
          nameContains: shortTextSchema.min(1).optional().describe('Case-insensitive substring the file name must contain.'),
          mimeType: shortTextSchema.min(1).optional().describe('Exact MIME type the file must have.'),
          pageSize: z.number().int().positive().max(1000).optional().describe('Max files to return (Drive default 100, max 1000).')
        })
        .strict(),
      outputSchema: listFilesOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => listFiles(cfg, args)
  )

  server.registerTool(
    'gsuite_sheet_get',
    {
      description:
        'Get a spreadsheet’s title and per-sheet grid dimensions. Returns `{title, sheets: [{sheetId, title, rowCount, columnCount}]}` — use the sheet titles to build A1 ranges for the values tools.',
      inputSchema: z
        .object({
          spreadsheetId: idSchema.describe('Spreadsheet id (from the URL or `gsuite_drive_files_list`).')
        })
        .strict(),
      outputSchema: getSheetOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getSheet(cfg, args)
  )

  server.registerTool(
    'gsuite_sheet_values_get',
    {
      description:
        'Read a range of cell values. Returns `{range, values}` where `values` is a string[][] (empty cells are ``); trailing empty rows/columns are omitted by the API.',
      inputSchema: z
        .object({
          spreadsheetId: idSchema.describe('Spreadsheet id.'),
          range: rangeSchema,
          majorDimension: z.enum(['ROWS', 'COLUMNS']).optional().describe('Whether each inner array is a row (default `ROWS`) or a column.')
        })
        .strict(),
      outputSchema: getValuesOutput,
      annotations: READ_ONLY_REMOTE
    },
    (args) => getValues(cfg, args)
  )

  server.registerTool(
    'gsuite_sheet_values_update',
    {
      description:
        'Write a rectangular block of values to a range (overwrites the cells it covers). `valueInputOption` defaults to `USER_ENTERED` (values are parsed as if typed in the UI — numbers, dates, formulas); pass `RAW` to store strings verbatim. Returns `{updatedRange, updatedCells, updatedRows, updatedColumns}`.',
      inputSchema: z
        .object({
          spreadsheetId: idSchema.describe('Spreadsheet id.'),
          range: rangeSchema,
          values: z.array(z.array(shortTextSchema)).min(1).describe('Row-major cell values to write.'),
          valueInputOption: z
            .enum(['USER_ENTERED', 'RAW'])
            .optional()
            .describe('`USER_ENTERED` (default): parse like UI input. `RAW`: store verbatim.')
        })
        .strict(),
      outputSchema: updateValuesOutput,
      annotations: WRITE_IDEMPOTENT_REMOTE
    },
    (args) => updateValues(cfg, args)
  )
}
