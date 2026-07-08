/**
 * Drive operations against the Drive v3 API. Each entry point takes the loaded
 * `Config` as its first argument and obtains an authenticated Drive client via
 * `driveService(cfg.auth)`. Usable from a script: `await listFiles(loadConfig(), {...})`.
 */
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { driveService } from '../google-client/index.js'

/**
 * Escape a value for embedding in a Drive `q` string literal — Drive query
 * string values are single-quoted and use backslash escaping.
 */
const escapeQ = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export const listFiles = async (
  cfg: Config,
  { folderId, nameContains, mimeType, pageSize }: { folderId: string; nameContains?: string; mimeType?: string; pageSize?: number }
) => {
  try {
    const drive = driveService(cfg.auth)
    // `q` is Drive's server-side filter; each clause is ANDed. `trashed = false`
    // keeps binned files out of the listing.
    const clauses = [`'${escapeQ(folderId)}' in parents`, 'trashed = false']
    if (nameContains) clauses.push(`name contains '${escapeQ(nameContains)}'`)
    if (mimeType) clauses.push(`mimeType = '${escapeQ(mimeType)}'`)
    const res = await drive.files.list({
      q: clauses.join(' and '),
      pageSize,
      fields: 'files(id,name,mimeType,modifiedTime)'
    })
    const files = (res.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? ''
    }))
    // Wrapped in an object (not a bare array) so structuredContent is a valid
    // JSON object per the MCP spec, matching the gsuite_drive_files_list outputSchema.
    return jsonResult({ files })
  } catch (err) {
    return errorResult('listing Drive files', err)
  }
}
