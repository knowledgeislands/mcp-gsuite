import { randomUUID } from 'node:crypto'
import path from 'node:path'

const CRLF = '\r\n'

export interface PreparedAttachment {
  filename: string
  mimeType: string
  data: Buffer
}

export interface DraftSpec {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  // At least one of `bodyText` / `bodyHtml` must be set. An empty `bodyText`
  // (`""`) is treated as "provided, intentionally empty" (back-compat). An
  // empty `bodyHtml` is treated as not-provided.
  bodyText?: string
  bodyHtml?: string
  // Message-ID of the message we're replying to (with angle brackets, e.g. "<abc@gmail.com>").
  inReplyTo?: string
  // Full References chain; the caller is responsible for appending inReplyTo.
  references?: string[]
  attachments?: PreparedAttachment[]
}

// Minimal extension → MIME-type table. We deliberately keep this small —
// most attachments in practice are PDFs, images, and Office docs.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.eml': 'message/rfc822',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime'
}

export const guessMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  return EXTENSION_MIME_TYPES[ext] ?? 'application/octet-stream'
}

// RFC 2047 encoded-word for non-ASCII header values. ASCII passes through.
// The range [ -~] is the printable-ASCII subset; using \u-escapes
// avoids the noControlCharactersInRegex lint that triggers on \x escapes.
const ASCII_PRINTABLE = /^[ -~]*$/

export const encodeHeader = (value: string): string => {
  if (ASCII_PRINTABLE.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

// RFC 5322 / 2047: encode the display-name portion of an address only.
// Bare emails (`addr@host`) and emails with ASCII-only names pass through unchanged.
// "日本語 <a@b.com>" → "=?UTF-8?B?...?= <a@b.com>"; surrounding double-quotes
// around the name are stripped before encoding so the encoded-word isn't double-wrapped.
export const encodeAddress = (address: string): string => {
  const angleIdx = address.indexOf('<')
  if (angleIdx <= 0) return address
  const rawName = address.slice(0, angleIdx).trim()
  const rest = address.slice(angleIdx)
  if (!rawName || ASCII_PRINTABLE.test(rawName)) return address
  const unquoted = rawName.replace(/^"(.*)"$/, '$1')
  return `${encodeHeader(unquoted)} ${rest}`
}

const quoteFilename = (filename: string): string => {
  // RFC 5987 / 2231 supports non-ASCII via `filename*=utf-8''<pct-encoded>` but
  // for v1 we keep it simple: ASCII-safe filenames get quoted as-is; non-ASCII
  // filenames are emitted with both legacy `filename="..."` (base64 in encoded-
  // word form — recipients that don't understand will still see *some* name)
  // and `filename*=utf-8''<percent-encoded>` (recipients that do).
  const safe = filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (ASCII_PRINTABLE.test(filename)) return `filename="${safe}"`
  const encoded = encodeURIComponent(filename)
  return `filename="${encodeHeader(filename)}"; filename*=utf-8''${encoded}`
}

const wrapBase64 = (b64: string, width = 76): string => {
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += width) lines.push(b64.slice(i, i + width))
  return lines.join(CRLF)
}

const normalizeNewlines = (s: string): string => s.replace(/\r\n|\r|\n/g, CRLF)

const emitHeader = (name: string, value: string): string => `${name}: ${value}${CRLF}`

const validateRecipients = (label: string, list: string[] | undefined): void => {
  if (!list) return
  for (const r of list) {
    if (r.includes('\r') || r.includes('\n')) {
      throw new Error(`${label} contains a newline — header injection is not allowed`)
    }
  }
}

// Discriminated union over the three legal shapes a draft body can take:
// text-only (back-compat), html-only, or both (→ multipart/alternative).
// "Empty html" is normalised to not-provided; "empty text" remains valid.
type BodyParts =
  | { kind: 'alt'; text: string; html: string; boundary: string }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }

const resolveBodyParts = (spec: DraftSpec): BodyParts => {
  const text = spec.bodyText
  const html = spec.bodyHtml && spec.bodyHtml.length > 0 ? spec.bodyHtml : undefined
  if (text !== undefined && html !== undefined) return { kind: 'alt', text, html, boundary: `ALT_BOUNDARY_${randomUUID()}` }
  if (text !== undefined) return { kind: 'text', text }
  if (html !== undefined) return { kind: 'html', html }
  throw new Error('At least one of `bodyText` or `bodyHtml` must be provided')
}

// Emit a single body section ("--BOUNDARY\r\n<headers>\r\n\r\n<body>\r\n").
// Caller is responsible for emitting the closing boundary marker.
const writeBodyPart = (segments: Buffer[], boundary: string, mimeType: string, body: string): void => {
  segments.push(Buffer.from(`--${boundary}${CRLF}`, 'utf8'))
  segments.push(Buffer.from(`Content-Type: ${mimeType}; charset=UTF-8${CRLF}`, 'utf8'))
  segments.push(Buffer.from(`Content-Transfer-Encoding: 8bit${CRLF}${CRLF}`, 'utf8'))
  segments.push(Buffer.from(`${normalizeNewlines(body)}${CRLF}`, 'utf8'))
}

export const buildRfc2822 = (spec: DraftSpec): Buffer => {
  if (spec.to.length === 0) throw new Error('At least one `to` recipient is required')
  validateRecipients('to', spec.to)
  validateRecipients('cc', spec.cc)
  validateRecipients('bcc', spec.bcc)
  if (spec.subject.includes('\r') || spec.subject.includes('\n')) {
    throw new Error('Subject contains a newline — header injection is not allowed')
  }
  const body = resolveBodyParts(spec)

  const headerLines: string[] = []
  // Each recipient's display name is RFC 2047-encoded if non-ASCII; bare and ASCII addresses pass through.
  const formatRecipients = (list: string[]): string => list.map(encodeAddress).join(', ')
  headerLines.push(emitHeader('To', formatRecipients(spec.to)))
  if (spec.cc?.length) headerLines.push(emitHeader('Cc', formatRecipients(spec.cc)))
  if (spec.bcc?.length) headerLines.push(emitHeader('Bcc', formatRecipients(spec.bcc)))
  headerLines.push(emitHeader('Subject', encodeHeader(spec.subject)))
  if (spec.inReplyTo) headerLines.push(emitHeader('In-Reply-To', spec.inReplyTo))
  if (spec.references?.length) headerLines.push(emitHeader('References', spec.references.join(' ')))
  headerLines.push(emitHeader('MIME-Version', '1.0'))

  const attachments = spec.attachments ?? []

  // No attachments → top-level is the body section itself.
  if (attachments.length === 0) {
    if (body.kind === 'alt') {
      headerLines.push(emitHeader('Content-Type', `multipart/alternative; boundary="${body.boundary}"`))
      const segments: Buffer[] = [Buffer.from(`${headerLines.join('')}${CRLF}`, 'utf8')]
      // RFC 2046: least-preferred alternative first, so text/plain precedes text/html.
      writeBodyPart(segments, body.boundary, 'text/plain', body.text)
      writeBodyPart(segments, body.boundary, 'text/html', body.html)
      segments.push(Buffer.from(`--${body.boundary}--${CRLF}`, 'utf8'))
      return Buffer.concat(segments)
    }
    const onlyType = body.kind === 'text' ? 'text/plain' : 'text/html'
    const onlyBody = body.kind === 'text' ? body.text : body.html
    headerLines.push(emitHeader('Content-Type', `${onlyType}; charset=UTF-8`))
    headerLines.push(emitHeader('Content-Transfer-Encoding', '8bit'))
    return Buffer.concat([
      Buffer.from(headerLines.join(''), 'utf8'),
      Buffer.from(CRLF, 'utf8'),
      Buffer.from(normalizeNewlines(onlyBody), 'utf8')
    ])
  }

  // With attachments → multipart/mixed wraps body section + attachment parts.
  const mixedBoundary = `BOUNDARY_${randomUUID()}`
  headerLines.push(emitHeader('Content-Type', `multipart/mixed; boundary="${mixedBoundary}"`))

  const segments: Buffer[] = [Buffer.from(`${headerLines.join('')}${CRLF}`, 'utf8')]

  if (body.kind === 'alt') {
    // Nested multipart/alternative as the first mixed part.
    segments.push(Buffer.from(`--${mixedBoundary}${CRLF}`, 'utf8'))
    segments.push(Buffer.from(`Content-Type: multipart/alternative; boundary="${body.boundary}"${CRLF}${CRLF}`, 'utf8'))
    writeBodyPart(segments, body.boundary, 'text/plain', body.text)
    writeBodyPart(segments, body.boundary, 'text/html', body.html)
    segments.push(Buffer.from(`--${body.boundary}--${CRLF}`, 'utf8'))
  } else {
    const onlyType = body.kind === 'text' ? 'text/plain' : 'text/html'
    const onlyBody = body.kind === 'text' ? body.text : body.html
    writeBodyPart(segments, mixedBoundary, onlyType, onlyBody)
  }

  for (const a of attachments) {
    segments.push(Buffer.from(`--${mixedBoundary}${CRLF}`, 'utf8'))
    segments.push(Buffer.from(`Content-Type: ${a.mimeType}${CRLF}`, 'utf8'))
    segments.push(Buffer.from(`Content-Disposition: attachment; ${quoteFilename(a.filename)}${CRLF}`, 'utf8'))
    segments.push(Buffer.from(`Content-Transfer-Encoding: base64${CRLF}${CRLF}`, 'utf8'))
    segments.push(Buffer.from(`${wrapBase64(a.data.toString('base64'))}${CRLF}`, 'utf8'))
  }

  segments.push(Buffer.from(`--${mixedBoundary}--${CRLF}`, 'utf8'))
  return Buffer.concat(segments)
}
