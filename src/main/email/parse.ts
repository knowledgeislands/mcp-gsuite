/**
 * Gmail payload-parsing helpers (Gmail-API-specific, no config): base64url
 * decode, header lookup, body extraction (text/plain preferred, HTML stripped),
 * and attachment-reference extraction from a message part tree.
 */
import type { gmail_v1 } from 'googleapis'

export const decodeBase64Url = (data: string): string => {
  return Buffer.from(data, 'base64url').toString('utf8')
}

/**
 * Gmail's `q` `label:` operator matches a label's display name with every space
 * replaced by a hyphen (`label:Foo-Bar`). A *quoted* label name
 * (`label:"Foo Bar"`) is silently ignored by `messages.list` / `threads.list`
 * and matches nothing — a false-negative, not an error. Callers naturally reach
 * for quotes when a label name contains spaces, so we rewrite any quoted
 * `label:` / `-label:` value to the hyphenated, unquoted form Gmail expects.
 *
 * Only the quoted form is touched: an unquoted `label:Foo Bar` is two tokens to
 * Gmail (`label:Foo` AND a full-text `Bar`) and cannot be repaired without
 * knowing the label boundary, so callers with spaces must quote (or use the
 * exact `labelIds` parameter). Slashes (label nesting) and existing hyphens are
 * preserved; every other operator and the unquoted form pass through untouched.
 */
export const normaliseQueryLabels = (query: string): string =>
  query.replace(
    /(^|[\s(])(-?)label:"([^"]*)"/g,
    (_match, pre: string, neg: string, name: string) => `${pre}${neg}label:${name.replace(/ /g, '-')}`
  )

export const headerValue = (headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string => {
  if (!headers) return ''
  const target = name.toLowerCase()
  for (const h of headers) {
    if (h.name?.toLowerCase() === target) return h.value ?? ''
  }
  return ''
}

const walkParts = (part: gmail_v1.Schema$MessagePart | undefined, visit: (p: gmail_v1.Schema$MessagePart) => void): void => {
  if (!part) return
  visit(part)
  for (const child of part.parts ?? []) walkParts(child, visit)
}

const findPart = (payload: gmail_v1.Schema$MessagePart | undefined, mimeType: string): gmail_v1.Schema$MessagePart | undefined => {
  let found: gmail_v1.Schema$MessagePart | undefined
  walkParts(payload, (p) => {
    if (!found && p.mimeType === mimeType && p.body?.data) found = p
  })
  return found
}

const stripHtml = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const extractBody = (payload: gmail_v1.Schema$MessagePart | undefined): string => {
  if (!payload) return ''

  // Single-part message: body lives directly on payload.
  if (!payload.parts?.length && payload.body?.data) {
    const text = decodeBase64Url(payload.body.data)
    return payload.mimeType === 'text/html' ? stripHtml(text) : text
  }

  const plain = findPart(payload, 'text/plain')
  if (plain?.body?.data) return decodeBase64Url(plain.body.data)

  const html = findPart(payload, 'text/html')
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data))

  return ''
}

export interface AttachmentRef {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

export const extractAttachments = (payload: gmail_v1.Schema$MessagePart | undefined): AttachmentRef[] => {
  const attachments: AttachmentRef[] = []
  walkParts(payload, (p) => {
    if (p.filename && p.body?.attachmentId) {
      attachments.push({
        attachmentId: p.body.attachmentId,
        filename: p.filename,
        mimeType: p.mimeType ?? 'application/octet-stream',
        size: p.body.size ?? 0
      })
    }
  })
  return attachments
}

export const hasAttachments = (payload: gmail_v1.Schema$MessagePart | undefined): boolean => {
  let found = false
  walkParts(payload, (p) => {
    if (p.filename && p.body?.attachmentId) found = true
  })
  return found
}
