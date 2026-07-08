/**
 * Draft operations against the Gmail API. Each entry point takes the loaded
 * `Config` as its first argument and obtains an authenticated Gmail client via
 * `gmailService(cfg.auth)`. Draft composition (RFC 2822 build, reply threading,
 * reply-all audience resolution) lives here.
 */
import fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../../config/index.js'
import { buildRfc2822, guessMimeType, type PreparedAttachment } from '../../utils/mime.js'
import { assertOutputPathWithinDownloadRoot } from '../../utils/paths.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { extractAttachments, extractBody, headerValue } from '../email/parse.js'
import { gmailService } from '../google-client/index.js'

// Attachment entries are either a bare path (filename + mimeType inferred from
// the path) or an object that can override either field independently.
type AttachmentInput = string | { path: string; filename?: string; mimeType?: string }

interface DraftInput {
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  bodyText?: string
  bodyHtml?: string
  attachments?: AttachmentInput[]
  replyToMessageId?: string
  replyAll?: boolean
}

// Authenticated email is process-stable — cache the first lookup.
let cachedAuthEmail: string | null = null
const getAuthenticatedEmail = async (cfg: Config): Promise<string> => {
  if (cachedAuthEmail !== null) return cachedAuthEmail
  const gmail = gmailService(cfg.auth)
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const emailAddress = profile.data.emailAddress
  if (!emailAddress) {
    throw new Error('Gmail returned an empty profile — cannot determine the authenticated address for `replyAll`.')
  }
  cachedAuthEmail = emailAddress.toLowerCase()
  return cachedAuthEmail
}

// Test seam — reset the cached authenticated email so each test starts clean.
export const _resetAuthEmailCacheForTests = (): void => {
  cachedAuthEmail = null
}

// Comma-separated address list → ["Name <a@b.com>", "c@d.com", ...]
const parseAddressList = (raw: string): string[] =>
  raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

// Extract just the email part for dedupe comparison. `Name <a@b.com>` → `a@b.com`.
const emailOf = (address: string): string => {
  const m = address.match(/<([^>]+)>/)
  return (m?.[1] ?? address).trim().toLowerCase()
}

// De-duplicate an address list (by email-only, case-insensitive) and drop any
// emails in `exclude`. Preserves the original display-name form of the first
// occurrence of each email.
const dedupeExcluding = (addresses: string[], exclude: Set<string>): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of addresses) {
    const key = emailOf(a)
    if (!key || exclude.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

interface ResolvedSpec {
  raw: string
  threadId?: string
}

// Read each draft attachment off disk, confined to `downloadRoot` (the same
// `cfg.downloadPath` the WRITE side — `attachment_get` — writes into). Without
// this guard a caller could exfiltrate an arbitrary host file as a draft
// attachment, so every path runs through the two-layer
// `assertOutputPathWithinDownloadRoot` guard (lexical "../" check + realpath
// symlink check) before any `fs.readFileSync`.
const readAttachments = async (downloadRoot: string, entries: AttachmentInput[] | undefined): Promise<PreparedAttachment[]> => {
  if (!entries?.length) return []
  // Ensure the root exists so the realpath layer of the guard can resolve it.
  await fsp.mkdir(downloadRoot, { recursive: true })
  return Promise.all(
    entries.map(async (entry) => {
      // Normalise both shapes (bare path / override object) into a single
      // (path, filename, mimeType) triple before reading the file.
      const spec = typeof entry === 'string' ? { path: entry } : entry
      const resolved = await assertOutputPathWithinDownloadRoot(downloadRoot, spec.path)
      return {
        filename: spec.filename ?? path.basename(resolved),
        mimeType: spec.mimeType ?? guessMimeType(resolved),
        data: fs.readFileSync(resolved)
      }
    })
  )
}

// Build the base64url-encoded RFC 2822 payload + optional threadId for a draft.
// Centralised so create + update share the exact same composition logic.
const composeDraft = async (cfg: Config, input: DraftInput): Promise<ResolvedSpec> => {
  if (input.replyAll && !input.replyToMessageId) {
    throw new Error('`replyAll` requires `replyToMessageId`.')
  }
  const attachments = await readAttachments(cfg.downloadPath, input.attachments)
  let inReplyTo: string | undefined
  let references: string[] | undefined
  let threadId: string | undefined
  let subject = input.subject ?? ''
  let to = input.to
  let cc = input.cc

  if (input.replyToMessageId) {
    const gmail = gmailService(cfg.auth)
    // For plain reply we only need Message-ID + Subject + References; for
    // reply-all we additionally need From / To / Cc to rebuild the audience.
    const metadataHeaders = input.replyAll
      ? ['Message-ID', 'Subject', 'References', 'From', 'To', 'Cc']
      : ['Message-ID', 'Subject', 'References']
    const orig = await gmail.users.messages.get({
      userId: 'me',
      id: input.replyToMessageId,
      format: 'metadata',
      metadataHeaders
    })
    threadId = orig.data.threadId ?? undefined
    const headers = orig.data.payload?.headers
    const originalMessageId = headerValue(headers, 'Message-ID')
    if (originalMessageId) {
      inReplyTo = originalMessageId
      const existing = headerValue(headers, 'References').split(/\s+/).filter(Boolean)
      references = [...existing, originalMessageId]
    }
    if (!input.subject) {
      const origSubject = headerValue(headers, 'Subject')
      subject = /^Re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`
    }

    if (input.replyAll) {
      // Auto-populate `to` and `cc` only when the caller hasn't supplied them.
      // Caller's explicit `to` / `cc` always win — this is a convenience, not a
      // takeover. Self-address is always dropped so we don't email ourselves.
      const me = await getAuthenticatedEmail(cfg)
      const exclude = new Set([me])
      if (to === undefined) {
        const origFrom = parseAddressList(headerValue(headers, 'From'))
        const origTo = parseAddressList(headerValue(headers, 'To'))
        to = dedupeExcluding([...origFrom, ...origTo], exclude)
      }
      if (cc === undefined) {
        const origCc = parseAddressList(headerValue(headers, 'Cc'))
        // `to` is set above (either from caller or auto-populated) so we can rely on it here.
        cc = dedupeExcluding(origCc, new Set([...exclude, ...to.map(emailOf)]))
      }
    }
  }

  if (!to || to.length === 0) {
    throw new Error('At least one `to` recipient is required (or use `replyAll` to auto-populate from the original message).')
  }

  const raw = buildRfc2822({
    to,
    cc,
    bcc: input.bcc,
    subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    inReplyTo,
    references,
    attachments
  }).toString('base64url')

  return { raw, threadId }
}

export const createDraft = async (cfg: Config, input: DraftInput) => {
  try {
    const gmail = gmailService(cfg.auth)
    const { raw, threadId } = await composeDraft(cfg, input)
    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw, threadId } }
    })
    return jsonResult({
      draftId: res.data.id ?? '',
      messageId: res.data.message?.id ?? '',
      threadId: res.data.message?.threadId ?? ''
    })
  } catch (err) {
    return errorResult('creating draft', err)
  }
}

export const updateDraft = async (cfg: Config, input: DraftInput & { draftId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const { raw, threadId } = await composeDraft(cfg, input)
    const res = await gmail.users.drafts.update({
      userId: 'me',
      id: input.draftId,
      requestBody: { message: { raw, threadId } }
    })
    return jsonResult({
      draftId: res.data.id ?? input.draftId,
      messageId: res.data.message?.id ?? '',
      threadId: res.data.message?.threadId ?? ''
    })
  } catch (err) {
    return errorResult('updating draft', err)
  }
}

export const listDrafts = async (
  cfg: Config,
  { query, maxResults, pageToken }: { query?: string; maxResults?: number; pageToken?: string }
) => {
  try {
    const gmail = gmailService(cfg.auth)
    const limit = maxResults ?? cfg.defaultSearchResults
    const list = await gmail.users.drafts.list({ userId: 'me', q: query, maxResults: limit, pageToken })
    const ids = list.data.drafts ?? []

    // Same N+1 pattern as search_messages: drafts.list returns sparse refs;
    // fetch each with format=metadata for usable headers.
    const drafts = await Promise.all(
      ids.map(async (d) => {
        const full = await gmail.users.drafts.get({
          userId: 'me',
          id: d.id ?? '',
          format: 'metadata'
        })
        const msg = full.data.message
        const headers = msg?.payload?.headers
        return {
          draftId: full.data.id ?? '',
          messageId: msg?.id ?? '',
          threadId: msg?.threadId ?? '',
          subject: headerValue(headers, 'Subject'),
          to: headerValue(headers, 'To'),
          cc: headerValue(headers, 'Cc'),
          date: headerValue(headers, 'Date'),
          snippet: msg?.snippet ?? ''
        }
      })
    )

    const response: { drafts: typeof drafts; nextPageToken?: string } = { drafts }
    if (list.data.nextPageToken) response.nextPageToken = list.data.nextPageToken
    return jsonResult(response)
  } catch (err) {
    return errorResult('listing drafts', err)
  }
}

export const getDraft = async (cfg: Config, { draftId }: { draftId: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'full' })
    const msg = res.data.message
    const payload = msg?.payload
    const headers = payload?.headers
    return jsonResult({
      draftId: res.data.id ?? draftId,
      messageId: msg?.id ?? '',
      threadId: msg?.threadId ?? '',
      subject: headerValue(headers, 'Subject'),
      to: headerValue(headers, 'To'),
      cc: headerValue(headers, 'Cc'),
      bcc: headerValue(headers, 'Bcc'),
      date: headerValue(headers, 'Date'),
      body: extractBody(payload),
      labelIds: msg?.labelIds ?? [],
      attachments: extractAttachments(payload)
    })
  } catch (err) {
    return errorResult('getting draft', err)
  }
}

export const deleteDraft = async (cfg: Config, { draftId, dry_run }: { draftId: string; dry_run: boolean }) => {
  try {
    const gmail = gmailService(cfg.auth)
    if (dry_run) {
      // Fetch metadata so the caller sees what would be deleted. If the draft
      // does not exist, Gmail returns 404 which we surface as an error.
      const draft = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'metadata' })
      const headers = draft.data.message?.payload?.headers ?? []
      const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? ''
      return jsonResult({ draftId, dry_run: true, deleted: false, would_delete: { draftId, subject } })
    }
    await gmail.users.drafts.delete({ userId: 'me', id: draftId })
    return jsonResult({ draftId, dry_run: false, deleted: true })
  } catch (err) {
    return errorResult('deleting draft', err)
  }
}
