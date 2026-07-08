import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config/index.js'

vi.mock('../google-client/index.js', () => ({
  sheetsService: vi.fn()
}))

const client = await import('../google-client/index.js')
const { getSheet, getValues, updateValues } = await import('./index.js')

const sheetsServiceMock = client.sheetsService as ReturnType<typeof vi.fn>

// Config is injected; only the slices these handlers read need to be present.
const cfg = { auth: {} } as unknown as Config

const makeSheets = () => ({
  spreadsheets: {
    get: vi.fn(),
    values: {
      get: vi.fn(),
      update: vi.fn()
    }
  }
})

beforeEach(() => {
  sheetsServiceMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getSheet', () => {
  it('returns the spreadsheet title and per-sheet grid properties', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.get.mockResolvedValue({
      data: {
        properties: { title: 'Budget 2026' },
        sheets: [
          { properties: { sheetId: 0, title: 'Sheet1', gridProperties: { rowCount: 1000, columnCount: 26 } } },
          { properties: { sheetId: 7, title: 'Summary', gridProperties: { rowCount: 50, columnCount: 5 } } }
        ]
      }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await getSheet(cfg, { spreadsheetId: 'sid' })
    expect(JSON.parse(r.content[0].text)).toEqual({
      title: 'Budget 2026',
      sheets: [
        { sheetId: 0, title: 'Sheet1', rowCount: 1000, columnCount: 26 },
        { sheetId: 7, title: 'Summary', rowCount: 50, columnCount: 5 }
      ]
    })
    expect(sheets.spreadsheets.get).toHaveBeenCalledWith({
      spreadsheetId: 'sid',
      fields: 'properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))'
    })
  })

  it('defaults missing title, sheets, and grid properties', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.get.mockResolvedValueOnce({ data: {} })
    sheetsServiceMock.mockReturnValue(sheets)

    const empty = await getSheet(cfg, { spreadsheetId: 'sid' })
    expect(JSON.parse(empty.content[0].text)).toEqual({ title: '', sheets: [] })

    sheets.spreadsheets.get.mockResolvedValueOnce({ data: { sheets: [{}, { properties: {} }] } })
    const sparse = await getSheet(cfg, { spreadsheetId: 'sid' })
    expect(JSON.parse(sparse.content[0].text)).toEqual({
      title: '',
      sheets: [
        { sheetId: 0, title: '', rowCount: 0, columnCount: 0 },
        { sheetId: 0, title: '', rowCount: 0, columnCount: 0 }
      ]
    })
  })

  it('returns an error result when the Sheets API throws', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.get.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Requested entity was not found.' } } }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await getSheet(cfg, { spreadsheetId: 'nope' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error getting spreadsheet: HTTP 404: Requested entity was not found.')
  })
})

describe('getValues', () => {
  it('returns the values as string[][] with ROWS as the default majorDimension', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.get.mockResolvedValue({
      data: { range: 'Sheet1!A1:B2', values: [['a', 1], ['b']] }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await getValues(cfg, { spreadsheetId: 'sid', range: 'A1:B2' })
    expect(JSON.parse(r.content[0].text)).toEqual({ range: 'Sheet1!A1:B2', values: [['a', '1'], ['b']] })
    expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: 'sid',
      range: 'A1:B2',
      majorDimension: 'ROWS'
    })
  })

  it('passes an explicit majorDimension through', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.get.mockResolvedValue({ data: { range: 'Sheet1!A1:B2', values: [] } })
    sheetsServiceMock.mockReturnValue(sheets)

    await getValues(cfg, { spreadsheetId: 'sid', range: 'A1:B2', majorDimension: 'COLUMNS' })
    expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith(expect.objectContaining({ majorDimension: 'COLUMNS' }))
  })

  it('defaults a missing values array, echoes the requested range, and stringifies null cells', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.get.mockResolvedValueOnce({ data: {} })
    sheetsServiceMock.mockReturnValue(sheets)

    const empty = await getValues(cfg, { spreadsheetId: 'sid', range: 'A1' })
    expect(JSON.parse(empty.content[0].text)).toEqual({ range: 'A1', values: [] })

    sheets.spreadsheets.values.get.mockResolvedValueOnce({ data: { range: 'Sheet1!A1', values: [[null, 'x']] } })
    const withNull = await getValues(cfg, { spreadsheetId: 'sid', range: 'A1' })
    expect(JSON.parse(withNull.content[0].text)).toEqual({ range: 'Sheet1!A1', values: [['', 'x']] })
  })

  it('returns an error result when the Sheets API throws', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.get.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Unable to parse range: Nope!A1' } } }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await getValues(cfg, { spreadsheetId: 'sid', range: 'Nope!A1' })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error getting sheet values: HTTP 400: Unable to parse range: Nope!A1')
  })
})

describe('updateValues', () => {
  it('updates the range and returns the update summary', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.update.mockResolvedValue({
      data: { updatedRange: 'Sheet1!A1:B2', updatedCells: 4, updatedRows: 2, updatedColumns: 2 }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await updateValues(cfg, {
      spreadsheetId: 'sid',
      range: 'A1:B2',
      values: [
        ['a', 'b'],
        ['c', 'd']
      ]
    })
    expect(JSON.parse(r.content[0].text)).toEqual({
      updatedRange: 'Sheet1!A1:B2',
      updatedCells: 4,
      updatedRows: 2,
      updatedColumns: 2
    })
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: 'sid',
      range: 'A1:B2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['a', 'b'],
          ['c', 'd']
        ]
      }
    })
  })

  it('passes an explicit valueInputOption through', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.update.mockResolvedValue({ data: {} })
    sheetsServiceMock.mockReturnValue(sheets)

    await updateValues(cfg, { spreadsheetId: 'sid', range: 'A1', values: [['x']], valueInputOption: 'RAW' })
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(expect.objectContaining({ valueInputOption: 'RAW' }))
  })

  it('defaults missing summary fields (echoing the requested range, zero counts)', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.update.mockResolvedValue({ data: {} })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await updateValues(cfg, { spreadsheetId: 'sid', range: 'A1', values: [['x']] })
    expect(JSON.parse(r.content[0].text)).toEqual({ updatedRange: 'A1', updatedCells: 0, updatedRows: 0, updatedColumns: 0 })
  })

  it('returns an error result when the Sheets API throws', async () => {
    const sheets = makeSheets()
    sheets.spreadsheets.values.update.mockRejectedValue({
      response: { status: 403, data: { error: { message: 'The caller does not have permission' } } }
    })
    sheetsServiceMock.mockReturnValue(sheets)

    const r = await updateValues(cfg, { spreadsheetId: 'sid', range: 'A1', values: [['x']] })
    expect(r).toHaveProperty('isError', true)
    expect(r.content[0].text).toBe('Error updating sheet values: HTTP 403: The caller does not have permission')
  })
})
