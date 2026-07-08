/**
 * Attachment operations against the Gmail API. Each entry point takes the
 * loaded `Config` as its first argument; inline responses are capped at
 * `cfg.inlineAttachmentMaxBytes` and `outputPath` writes are confined to
 * `cfg.downloadPath`.
 */
import fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../../config/index.js'
import { assertOutputPathWithinDownloadRoot } from '../../utils/paths.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { extractAttachments } from '../email/parse.js'
import { gmailService } from '../google-client/index.js'

const inlineTooLargeError = (inlineMax: number, sizeBytes: number): ReturnType<typeof errorResult> => {
  return errorResult(
    'getting attachment',
    new Error(
      `Attachment is ${sizeBytes}B which exceeds the inline cap of ${inlineMax}B. Re-call with \`outputPath\` to write the bytes to disk under MCP_GSUITE_DOWNLOAD_PATH instead, or raise MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES if you understand the response-size implications.`
    )
  )
}

export const getAttachmentMetadata = async (cfg: Config, { messageId, attachmentId }: { messageId: string; attachmentId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // `messages.get(format=full)` returns the part tree (including filename,
    // mimeType, and body.size for each attachment part) without fetching the
    // attachment bytes themselves. That's exactly what we want here — the
    // caller can decide whether to call `attachment_get` for the bytes.
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
    const found = extractAttachments(msg.data.payload).find((a) => a.attachmentId === attachmentId)
    if (!found) {
      return errorResult('getting attachment metadata', new Error(`No attachment with id "${attachmentId}" on message "${messageId}"`))
    }
    return jsonResult({
      messageId,
      attachmentId,
      filename: found.filename,
      mimeType: found.mimeType,
      sizeBytes: found.size
    })
  } catch (err) {
    return errorResult('getting attachment metadata', err)
  }
}

export const getAttachment = async (
  cfg: Config,
  { messageId, attachmentId, outputPath }: { messageId: string; attachmentId: string; outputPath?: string }
) => {
  try {
    const gmail = gmailService(cfg.auth)

    // outputPath path: caller already has filename/mimeType from get_message
    // and wants the decoded bytes on disk. Skip the message metadata fetch
    // entirely — saves a round-trip and avoids the lookup-mismatch failure
    // mode that motivated bug 1. Validate outputPath against downloadPath
    // before any API call so an unauthorised target fails fast.
    if (outputPath) {
      await fsp.mkdir(cfg.downloadPath, { recursive: true })
      const resolved = await assertOutputPathWithinDownloadRoot(cfg.downloadPath, outputPath)
      const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId })
      const bytes = Buffer.from(att.data.data ?? '', 'base64url')
      await fsp.mkdir(path.dirname(resolved), { recursive: true })
      fs.writeFileSync(resolved, bytes)
      return jsonResult({ messageId, path: resolved, sizeBytes: bytes.length })
    }

    // Inline path: fetch the message so we can populate filename/mimeType.
    // The part lookup is best-effort — Gmail's attachments.get is the source
    // of truth for the bytes, so we don't fail the call when the lookup misses.
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
    const meta = extractAttachments(msg.data.payload).find((a) => a.attachmentId === attachmentId)

    // Early bail when metadata gives us the size — saves the attachment fetch
    // for clearly-too-large attachments.
    if (meta?.size !== undefined && meta.size > cfg.inlineAttachmentMaxBytes) {
      return inlineTooLargeError(cfg.inlineAttachmentMaxBytes, meta.size)
    }

    const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId })

    // Defense in depth — re-check decoded size in case metadata was missing or
    // the attachment grew between lookup and fetch.
    const decodedSize = Buffer.byteLength(att.data.data ?? '', 'base64url')
    if (decodedSize > cfg.inlineAttachmentMaxBytes) {
      return inlineTooLargeError(cfg.inlineAttachmentMaxBytes, decodedSize)
    }

    return jsonResult({
      filename: meta?.filename ?? '',
      mimeType: meta?.mimeType ?? 'application/octet-stream',
      data: att.data.data ?? ''
    })
  } catch (err) {
    return errorResult('getting attachment', err)
  }
}
