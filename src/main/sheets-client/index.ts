/**
 * Sheets operations against the Sheets v4 API. Each entry point takes the
 * loaded `Config` as its first argument and obtains an authenticated Sheets
 * client via `sheetsService(cfg.auth)`.
 */
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { sheetsService } from '../google-client/index.js'

export const getSheet = async (cfg: Config, { spreadsheetId }: { spreadsheetId: string }) => {
  try {
    const sheets = sheetsService(cfg.auth)
    // `fields` trims the response to the spreadsheet title + per-sheet grid
    // properties — everything the caller needs to address ranges, nothing more.
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))'
    })
    const sheetList = (res.data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? '',
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0
    }))
    return jsonResult({ title: res.data.properties?.title ?? '', sheets: sheetList })
  } catch (err) {
    return errorResult('getting spreadsheet', err)
  }
}

export const getValues = async (
  cfg: Config,
  { spreadsheetId, range, majorDimension }: { spreadsheetId: string; range: string; majorDimension?: 'ROWS' | 'COLUMNS' }
) => {
  try {
    const sheets = sheetsService(cfg.auth)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: majorDimension ?? 'ROWS'
    })
    // The API returns cells as loosely-typed values; stringify each so the
    // result is a uniform string[][] (empty cells become '').
    const values = (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? '')))
    return jsonResult({ range: res.data.range ?? range, values })
  } catch (err) {
    return errorResult('getting sheet values', err)
  }
}

export const updateValues = async (
  cfg: Config,
  {
    spreadsheetId,
    range,
    values,
    valueInputOption
  }: { spreadsheetId: string; range: string; values: string[][]; valueInputOption?: 'USER_ENTERED' | 'RAW' }
) => {
  try {
    const sheets = sheetsService(cfg.auth)
    // USER_ENTERED parses values as if typed into the UI (numbers, dates,
    // formulas); RAW stores them verbatim as strings.
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: valueInputOption ?? 'USER_ENTERED',
      requestBody: { values }
    })
    return jsonResult({
      updatedRange: res.data.updatedRange ?? range,
      updatedCells: res.data.updatedCells ?? 0,
      updatedRows: res.data.updatedRows ?? 0,
      updatedColumns: res.data.updatedColumns ?? 0
    })
  } catch (err) {
    return errorResult('updating sheet values', err)
  }
}
