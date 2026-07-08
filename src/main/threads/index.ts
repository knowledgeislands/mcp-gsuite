/**
 * Thread operations against the Gmail API. Each entry point takes the loaded
 * `Config` as its first argument and obtains an authenticated Gmail client via
 * `gmailService(cfg.auth)`.
 */
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { extractAttachments, extractBody, hasAttachments, headerValue, normaliseQueryLabels } from '../email/parse.js'
import { gmailService } from '../google-client/index.js'

export const searchThreads = async (
  cfg: Config,
  { query, maxResults, pageToken, labelIds }: { query: string; maxResults?: number; pageToken?: string; labelIds?: string[] }
) => {
  try {
    const gmail = gmailService(cfg.auth)
    const limit = maxResults ?? cfg.defaultSearchResults
    // `labelIds` is Gmail's exact, name-format-free label filter; `q=label:`
    // matching is finicky for names with spaces, so we also normalise the query.
    const list = await gmail.users.threads.list({
      userId: 'me',
      q: normaliseQueryLabels(query),
      maxResults: limit,
      pageToken,
      ...(labelIds?.length ? { labelIds } : {})
    })
    const ids = list.data.threads ?? []

    // Threads.list returns id + snippet only. We fetch each thread's metadata
    // to get header info for the most recent message and an accurate message
    // count. Same N+1 pattern as search_messages.
    const threads = await Promise.all(
      ids.map(async (t) => {
        const full = await gmail.users.threads.get({
          userId: 'me',
          id: t.id ?? '',
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        })
        const messages = full.data.messages ?? []
        const latest = messages[messages.length - 1]
        const headers = latest?.payload?.headers
        // Union of labelIds across all messages — Gmail thread labels are the
        // union, not a separate field.
        const labelIdSet = new Set<string>()
        for (const m of messages) for (const id of m.labelIds ?? []) labelIdSet.add(id)
        return {
          threadId: full.data.id ?? '',
          snippet: full.data.snippet ?? '',
          messageCount: messages.length,
          latestSubject: headerValue(headers, 'Subject'),
          latestFrom: headerValue(headers, 'From'),
          latestDate: headerValue(headers, 'Date'),
          labelIds: [...labelIdSet]
        }
      })
    )

    const response: { threads: typeof threads; nextPageToken?: string } = { threads }
    if (list.data.nextPageToken) response.nextPageToken = list.data.nextPageToken
    return jsonResult(response)
  } catch (err) {
    return errorResult('searching threads', err)
  }
}

export const getThread = async (cfg: Config, { threadId }: { threadId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
    const rawMessages = res.data.messages ?? []

    const messages = rawMessages.map((m) => {
      const payload = m.payload
      const headers = payload?.headers
      return {
        messageId: m.id ?? '',
        subject: headerValue(headers, 'Subject'),
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        cc: headerValue(headers, 'Cc'),
        date: headerValue(headers, 'Date'),
        body: extractBody(payload),
        labelIds: m.labelIds ?? [],
        hasAttachments: hasAttachments(payload),
        attachments: extractAttachments(payload)
      }
    })

    return jsonResult({
      threadId: res.data.id ?? threadId,
      messageCount: messages.length,
      messages
    })
  } catch (err) {
    return errorResult('getting thread', err)
  }
}

export const labelThread = async (cfg: Config, { threadId, labelIds }: { threadId: string; labelIds: string[] }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds: labelIds }
    })
    // Union the labels back the same way search returns them so callers see a
    // consistent shape.
    const labelIdSet = new Set<string>()
    for (const m of res.data.messages ?? []) for (const id of m.labelIds ?? []) labelIdSet.add(id)
    return jsonResult({ threadId: res.data.id ?? threadId, labelIds: [...labelIdSet] })
  } catch (err) {
    return errorResult('labeling thread', err)
  }
}

export const unlabelThread = async (cfg: Config, { threadId, labelIds }: { threadId: string; labelIds: string[] }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { removeLabelIds: labelIds }
    })
    const labelIdSet = new Set<string>()
    for (const m of res.data.messages ?? []) for (const id of m.labelIds ?? []) labelIdSet.add(id)
    return jsonResult({ threadId: res.data.id ?? threadId, labelIds: [...labelIdSet] })
  } catch (err) {
    return errorResult('unlabeling thread', err)
  }
}

// Sugar wrappers around `threads.modify` for the common UNREAD / INBOX flips.
// Same label-union shape as label / unlabel so callers see a consistent payload.
const modifyThread = async (
  cfg: Config,
  threadId: string,
  body: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<{ threadId: string; labelIds: string[] }> => {
  const gmail = gmailService(cfg.auth)
  const res = await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: body })
  const labelIdSet = new Set<string>()
  for (const m of res.data.messages ?? []) for (const id of m.labelIds ?? []) labelIdSet.add(id)
  return { threadId: res.data.id ?? threadId, labelIds: [...labelIdSet] }
}

export const threadMarkRead = async (cfg: Config, { threadId }: { threadId: string }) => {
  try {
    return jsonResult(await modifyThread(cfg, threadId, { removeLabelIds: ['UNREAD'] }))
  } catch (err) {
    return errorResult('marking thread read', err)
  }
}

export const threadMarkUnread = async (cfg: Config, { threadId }: { threadId: string }) => {
  try {
    return jsonResult(await modifyThread(cfg, threadId, { addLabelIds: ['UNREAD'] }))
  } catch (err) {
    return errorResult('marking thread unread', err)
  }
}

export const threadArchive = async (cfg: Config, { threadId }: { threadId: string }) => {
  try {
    return jsonResult(await modifyThread(cfg, threadId, { removeLabelIds: ['INBOX'] }))
  } catch (err) {
    return errorResult('archiving thread', err)
  }
}

export const threadTrash = async (cfg: Config, { threadId }: { threadId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // `threads.trash` moves every message in the thread to Trash. Recoverable
    // for ~30 days; permanent deletion is intentionally not exposed.
    const res = await gmail.users.threads.trash({ userId: 'me', id: threadId })
    const labelIdSet = new Set<string>()
    for (const m of res.data.messages ?? []) for (const id of m.labelIds ?? []) labelIdSet.add(id)
    return jsonResult({ threadId: res.data.id ?? threadId, labelIds: [...labelIdSet] })
  } catch (err) {
    return errorResult('trashing thread', err)
  }
}
