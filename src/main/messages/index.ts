/**
 * Message operations against the Gmail API. Each entry point takes the loaded
 * `Config` as its first argument; the `outputPath` writer for raw messages is
 * confined to `cfg.downloadPath`.
 */
import fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../../config/index.js'
import { assertOutputPathWithinDownloadRoot } from '../../utils/paths.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { extractAttachments, extractBody, hasAttachments, headerValue, normaliseQueryLabels } from '../email/parse.js'
import { gmailService } from '../google-client/index.js'

export const searchMessages = async (
  cfg: Config,
  { query, maxResults, pageToken, labelIds }: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }
) => {
  try {
    const gmail = gmailService(cfg.auth)
    const limit = maxResults ?? cfg.defaultSearchResults
    // `labelIds` is Gmail's exact, name-format-free label filter; `q=label:`
    // matching is finicky for names with spaces, so we also normalise the query.
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: normaliseQueryLabels(query),
      maxResults: limit,
      pageToken,
      ...(labelIds?.length ? { labelIds } : {})
    })
    const ids = list.data.messages ?? []

    const messages = await Promise.all(
      ids.map(async (m) => {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: m.id ?? '',
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        })
        const headers = full.data.payload?.headers
        return {
          messageId: full.data.id ?? '',
          threadId: full.data.threadId ?? '',
          subject: headerValue(headers, 'Subject'),
          from: headerValue(headers, 'From'),
          date: headerValue(headers, 'Date'),
          snippet: full.data.snippet ?? '',
          labelIds: full.data.labelIds ?? [],
          hasAttachments: hasAttachments(full.data.payload)
        }
      })
    )

    // Gmail returns nextPageToken only when there is a subsequent page. We
    // pass it through (or omit) so callers can detect end-of-results.
    const response: { messages: typeof messages; nextPageToken?: string } = { messages }
    if (list.data.nextPageToken) response.nextPageToken = list.data.nextPageToken
    return jsonResult(response)
  } catch (err) {
    return errorResult('searching messages', err)
  }
}

export const getMessage = async (cfg: Config, { messageId, format }: { messageId: string; format?: 'metadata' | 'full' }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // `format=metadata` returns headers + labels but omits the part tree and
    // body data. That makes the response cheap for callers who only need
    // headers, at the cost of `body` and `attachments` being empty.
    const resolvedFormat = format ?? 'full'
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: resolvedFormat })
    const payload = res.data.payload
    const headers = payload?.headers
    return jsonResult({
      messageId: res.data.id ?? messageId,
      threadId: res.data.threadId ?? '',
      subject: headerValue(headers, 'Subject'),
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      cc: headerValue(headers, 'Cc'),
      date: headerValue(headers, 'Date'),
      body: extractBody(payload),
      labelIds: res.data.labelIds ?? [],
      attachments: extractAttachments(payload)
    })
  } catch (err) {
    return errorResult('getting message', err)
  }
}

export const getRawMessage = async (cfg: Config, { messageId, outputPath }: { messageId: string; outputPath: string }) => {
  try {
    // Ensure the download root exists so realpath() can resolve it, then
    // validate outputPath against it. Rejects "..", absolute escapes, and
    // symlink hops that would otherwise let writes land anywhere.
    await fsp.mkdir(cfg.downloadPath, { recursive: true })
    const resolved = await assertOutputPathWithinDownloadRoot(cfg.downloadPath, outputPath)

    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'raw' })
    if (!res.data.raw) {
      return errorResult('getting raw message', new Error('Gmail returned no raw content for this message'))
    }
    // Decode base64url → raw RFC 2822 bytes, then write directly to the
    // caller's path. Avoids piping a multi-megabyte string back through the
    // MCP response (which would overflow the context window for messages
    // with sizeable attachments).
    //
    // Note: we deliberately do not return Subject/Date here. With format=raw,
    // Gmail does not populate payload.headers — those values live inside the
    // raw bytes. The caller already has them from get_message.
    const bytes = Buffer.from(res.data.raw, 'base64url')
    await fsp.mkdir(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, bytes)
    return jsonResult({
      messageId: res.data.id ?? messageId,
      path: resolved,
      sizeBytes: bytes.length
    })
  } catch (err) {
    return errorResult('getting raw message', err)
  }
}

export const labelMessage = async (cfg: Config, { messageId, labelIds }: { messageId: string; labelIds: string[] }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: labelIds }
    })
    return jsonResult({ messageId: res.data.id ?? messageId, labelIds: res.data.labelIds ?? [] })
  } catch (err) {
    return errorResult('labeling message', err)
  }
}

export const unlabelMessage = async (cfg: Config, { messageId, labelIds }: { messageId: string; labelIds: string[] }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: labelIds }
    })
    return jsonResult({ messageId: res.data.id ?? messageId, labelIds: res.data.labelIds ?? [] })
  } catch (err) {
    return errorResult('unlabeling message', err)
  }
}

// Sugar wrappers around `messages.modify` for the common UNREAD / INBOX flips.
// Centralised so the four sugar handlers below stay one-liners.
const modifyMessage = async (
  cfg: Config,
  messageId: string,
  body: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<{ messageId: string; labelIds: string[] }> => {
  const gmail = gmailService(cfg.auth)
  const res = await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: body })
  return { messageId: res.data.id ?? messageId, labelIds: res.data.labelIds ?? [] }
}

export const messageMarkRead = async (cfg: Config, { messageId }: { messageId: string }) => {
  try {
    return jsonResult(await modifyMessage(cfg, messageId, { removeLabelIds: ['UNREAD'] }))
  } catch (err) {
    return errorResult('marking message read', err)
  }
}

export const messageMarkUnread = async (cfg: Config, { messageId }: { messageId: string }) => {
  try {
    return jsonResult(await modifyMessage(cfg, messageId, { addLabelIds: ['UNREAD'] }))
  } catch (err) {
    return errorResult('marking message unread', err)
  }
}

export const messageArchive = async (cfg: Config, { messageId }: { messageId: string }) => {
  try {
    return jsonResult(await modifyMessage(cfg, messageId, { removeLabelIds: ['INBOX'] }))
  } catch (err) {
    return errorResult('archiving message', err)
  }
}

export const messageTrash = async (cfg: Config, { messageId }: { messageId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // `messages.trash` adds the TRASH label + removes INBOX; recoverable for
    // ~30 days from Gmail's Trash UI. Distinct from `messages.delete`, which
    // is permanent and we deliberately do not expose.
    const res = await gmail.users.messages.trash({ userId: 'me', id: messageId })
    return jsonResult({ messageId: res.data.id ?? messageId, labelIds: res.data.labelIds ?? [] })
  } catch (err) {
    return errorResult('trashing message', err)
  }
}

export const messageBatchModify = async (
  cfg: Config,
  { messageIds, addLabelIds, removeLabelIds }: { messageIds: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }
) => {
  // Gmail's `batchModify` is a one-call alternative to N individual `modify`
  // calls. The API returns 204 No Content on success, so we echo the
  // inputs back as the result for caller-side auditing.
  if (!addLabelIds?.length && !removeLabelIds?.length) {
    return errorResult('batch-modifying messages', new Error('At least one of `addLabelIds` or `removeLabelIds` must be provided.'))
  }
  try {
    const gmail = gmailService(cfg.auth)
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids: messageIds, addLabelIds, removeLabelIds }
    })
    return jsonResult({
      count: messageIds.length,
      messageIds,
      addLabelIds: addLabelIds ?? [],
      removeLabelIds: removeLabelIds ?? []
    })
  } catch (err) {
    return errorResult('batch-modifying messages', err)
  }
}
