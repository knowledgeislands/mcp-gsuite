/**
 * Path-containment helpers for tools that accept caller-provided filesystem
 * write targets (e.g. `outputPath` on `attachment_get` and `message_get_raw`).
 *
 * Same two-layer pattern as mcp-kb-fs / mcp-claude-housekeeping:
 *   - `resolveWithinRoot` is a fast lexical guard (handles "..", absolute-style
 *     inputs, separator quirks).
 *   - `assertRealPathWithinRoot` resolves symlinks and verifies the target —
 *     or its nearest existing ancestor for not-yet-created files — really lives
 *     inside the configured root.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const resolveWithinRoot = (root: string, relativePath: string): string => {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const resolved = path.resolve(root, cleaned)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path escapes root: "${relativePath}"`)
  }
  return resolved
}

export const assertRealPathWithinRoot = async (root: string, absPath: string): Promise<void> => {
  const realRoot = await fs.realpath(root)
  let probe = absPath
  while (probe !== path.dirname(probe)) {
    try {
      await fs.access(probe)
      break
    } catch {
      probe = path.dirname(probe)
    }
  }
  const realProbe = await fs.realpath(probe)
  const realRootWithSep = realRoot + path.sep
  if (realProbe !== realRoot && !realProbe.startsWith(realRootWithSep)) {
    throw new Error(`Path escapes root: "${path.relative(root, absPath)}"`)
  }
}

/**
 * Validate a caller-provided write target against the download root.
 *
 * Absolute inputs are taken as-is and checked for containment in the root.
 * Relative inputs are resolved against the root first. In both cases the
 * resolved path (and its nearest existing ancestor, post-realpath) must live
 * inside the root.
 *
 * Throws on `..` escapes, symlink-based escapes, or absolute targets outside
 * the root. Callers must pre-create the download root so realpath() works.
 */
export const assertOutputPathWithinDownloadRoot = async (downloadRoot: string, outputPath: string): Promise<string> => {
  const resolved = path.isAbsolute(outputPath) ? path.resolve(outputPath) : path.resolve(downloadRoot, outputPath)
  const rootWithSep = downloadRoot.endsWith(path.sep) ? downloadRoot : downloadRoot + path.sep
  if (resolved !== downloadRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(`outputPath escapes download root: "${outputPath}" resolves to "${resolved}" (root: ${downloadRoot})`)
  }
  await assertRealPathWithinRoot(downloadRoot, resolved)
  return resolved
}
