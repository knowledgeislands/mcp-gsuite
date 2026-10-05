import type { gmail_v1 } from 'googleapis'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { buildRfc2822, type PreparedAttachment } from '../../utils/mime.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { idSchema } from '../../utils/schemas.js'
import { extractBody, headerValue } from '../email/parse.js'
import { gmailService } from '../google-client/index.js'

const MAX_BYTES = 10 * 1024 * 1024
export const forwardInputSchema = z
  .object({
    messageId: idSchema,
    to: z
      .array(
        z
          .string()
          .min(1)
          .max(998)
          .regex(/^[^\r\n]+$/)
      )
      .min(1)
      .max(100)
  })
  .strict()

/** Forwarding never sends: quote text and preserve attachment bytes in a new draft. */
export const forwardDraft = async (cfg: Config, input: z.infer<typeof forwardInputSchema>) => {
  try {
    const args = forwardInputSchema.parse(input)
    const gmail = gmailService(cfg.auth)
    const { data: original } = await gmail.users.messages.get({ userId: 'me', id: args.messageId, format: 'full' })
    if (!original.payload) throw new Error('Original message has no MIME payload')
    const parts: gmail_v1.Schema$MessagePart[] = []
    const bodyParts: gmail_v1.Schema$MessagePart[] = []
    const visit = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.parts?.length) {
        if (
          part.filename ||
          part.body?.attachmentId ||
          /^\s*attachment\b/i.test(headerValue(part.headers, 'Content-Disposition'))
        )
          throw new Error('Nested attachment containers require an unparsed source; cannot preserve bytes')
        for (const child of part.parts) visit(child)
      } else if (
        !part.filename &&
        !/^\s*attachment\b/i.test(headerValue(part.headers, 'Content-Disposition')) &&
        (part.mimeType === 'text/plain' || part.mimeType === 'text/html')
      ) {
        bodyParts.push(part)
      } else {
        parts.push(part)
      }
    }

    visit(original.payload)
    if (parts.length > 50) throw new Error('Forward exceeds 50 attachments')
    const decodePart = async (part: gmail_v1.Schema$MessagePart, remaining: number): Promise<Buffer> => {
      const declared = part.body?.size
      if (typeof declared !== 'number' || !Number.isSafeInteger(declared) || declared < 0 || declared > remaining) {
        throw new Error('MIME part size is missing, invalid, or exceeds the 10 MiB limit')
      }
      let encoded = part.body?.data
      if (part.body?.attachmentId) {
        const result = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: args.messageId,
          id: part.body.attachmentId
        })
        encoded = result.data.data
      }
      if (
        typeof encoded !== 'string' ||
        !/^[A-Za-z0-9_-]*={0,2}$/.test(encoded) ||
        encoded.length > Math.ceil(remaining / 3) * 4
      ) {
        throw new Error('MIME part bytes are missing, malformed, or exceed the limit')
      }
      const bytes = Buffer.from(encoded, 'base64url')
      if (
        bytes.toString('base64url') !== encoded.replace(/=+$/, '') ||
        bytes.length !== declared ||
        bytes.length > remaining
      ) {
        throw new Error('MIME part size does not match its bytes')
      }
      return bytes
    }
    const selectedBody =
      bodyParts.find((part) => part.mimeType === 'text/plain') ??
      bodyParts.find((part) => part.mimeType === 'text/html')
    let originalText = ''
    if (selectedBody) {
      const bytes = await decodePart(selectedBody, MAX_BYTES)
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      // Only the attachment-aware selected leaf reaches the shared HTML-to-text converter.
      originalText = extractBody({ mimeType: selectedBody.mimeType, body: { data: bytes.toString('base64url') } })
    }
    let total = 0
    const attachments: PreparedAttachment[] = []
    for (const part of parts) {
      const bytes = await decodePart(part, MAX_BYTES - total)
      total += bytes.length
      const filename = part.filename || `inline-${attachments.length + 1}`
      const mimeType = part.mimeType || 'application/octet-stream'
      if (/[\r\n]/.test(filename + mimeType)) throw new Error('Attachment metadata contains a newline')
      attachments.push({ filename, mimeType, data: bytes })
    }
    const headers = original.payload.headers
    const subject = headerValue(headers, 'Subject')
    const bodyText = [
      '---------- Forwarded message ----------',
      ...['From', 'Date', 'Subject', 'To'].map((name) => `${name}: ${headerValue(headers, name)}`),
      '',
      originalText
    ].join('\n')
    if (Buffer.byteLength(bodyText) > MAX_BYTES) throw new Error('Forwarded body exceeds 10 MiB')
    const raw = buildRfc2822({
      to: args.to,
      subject: /^Fwd:/i.test(subject) ? subject : `Fwd: ${subject}`,
      bodyText,
      attachments
    }).toString('base64url')
    const { data: draft } = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })
    return jsonResult({
      draftId: draft.id,
      attachmentCount: attachments.length,
      attachmentBytes: total,
      fidelity: 'plain-text; inline parts retained as ordinary attachments'
    })
  } catch (error) {
    return errorResult('creating forward draft', error)
  }
}
