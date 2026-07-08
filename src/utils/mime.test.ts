import { describe, expect, it } from 'vitest'
import { buildRfc2822, encodeAddress, encodeHeader, guessMimeType } from './mime.js'

const decode = (b: Buffer): string => b.toString('utf8')

describe('guessMimeType', () => {
  it('maps common extensions', () => {
    expect(guessMimeType('a.pdf')).toBe('application/pdf')
    expect(guessMimeType('img.png')).toBe('image/png')
    expect(guessMimeType('doc.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(guessMimeType('archive.zip')).toBe('application/zip')
    expect(guessMimeType('msg.eml')).toBe('message/rfc822')
  })

  it('is case-insensitive on the extension', () => {
    expect(guessMimeType('A.PDF')).toBe('application/pdf')
  })

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(guessMimeType('thing.xyz')).toBe('application/octet-stream')
    expect(guessMimeType('no-extension')).toBe('application/octet-stream')
  })
})

describe('encodeHeader', () => {
  it('returns ASCII unchanged', () => {
    expect(encodeHeader('Hello, world!')).toBe('Hello, world!')
  })

  it('encodes non-ASCII as base64 in encoded-word form', () => {
    expect(encodeHeader('Héllo')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
    expect(encodeHeader('日本語')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
  })

  it('round-trips the underlying bytes', () => {
    const encoded = encodeHeader('Héllo')
    const match = encoded.match(/^=\?UTF-8\?B\?(.+)\?=$/)
    if (!match) throw new Error(`expected encoded-word form, got ${encoded}`)
    expect(Buffer.from(match[1], 'base64').toString('utf8')).toBe('Héllo')
  })
})

describe('encodeAddress', () => {
  it('passes bare email addresses through unchanged', () => {
    expect(encodeAddress('addr@host.com')).toBe('addr@host.com')
  })

  it('passes ASCII display names through unchanged', () => {
    expect(encodeAddress('Alice <alice@example.com>')).toBe('Alice <alice@example.com>')
    expect(encodeAddress('"Alice, of QA" <alice@example.com>')).toBe('"Alice, of QA" <alice@example.com>')
  })

  it('passes "<addr>" (no display name) through unchanged', () => {
    expect(encodeAddress('<alice@example.com>')).toBe('<alice@example.com>')
  })

  it('encodes a non-ASCII display name as RFC 2047 encoded-word, leaves the email part intact', () => {
    expect(encodeAddress('日本語 <a@b.com>')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@b\.com>$/)
  })

  it('strips surrounding double-quotes from a non-ASCII display name before encoding (no double wrap)', () => {
    const out = encodeAddress('"Héllo Wörld" <h@w.com>')
    const m = out.match(/^=\?UTF-8\?B\?(.+)\?= <h@w\.com>$/)
    if (!m) throw new Error(`unexpected output: ${out}`)
    // The decoded base64 should be the *unquoted* name.
    expect(Buffer.from(m[1], 'base64').toString('utf8')).toBe('Héllo Wörld')
  })

  it('passes through odd shapes (no `<`) untouched rather than mangling them', () => {
    expect(encodeAddress('weird-no-angle')).toBe('weird-no-angle')
    expect(encodeAddress('')).toBe('')
  })
})

describe('buildRfc2822 (no attachments)', () => {
  it('builds a single-part text/plain message with the expected headers', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'Hello', bodyText: 'Body line' }))
    expect(out).toContain('To: x@y.com\r\n')
    expect(out).toContain('Subject: Hello\r\n')
    expect(out).toContain('MIME-Version: 1.0\r\n')
    expect(out).toContain('Content-Type: text/plain; charset=UTF-8\r\n')
    expect(out).toContain('Content-Transfer-Encoding: 8bit\r\n')
    expect(out).toMatch(/\r\n\r\nBody line$/)
  })

  it('joins multiple recipients with comma-space', () => {
    const out = decode(buildRfc2822({ to: ['a@x.com', 'b@x.com'], subject: 'S', bodyText: 'B' }))
    expect(out).toContain('To: a@x.com, b@x.com\r\n')
  })

  it('includes Cc and Bcc when provided, omits them when not', () => {
    const withCc = decode(buildRfc2822({ to: ['a@x.com'], cc: ['c@x.com'], bcc: ['b@x.com'], subject: 'S', bodyText: 'B' }))
    expect(withCc).toContain('Cc: c@x.com\r\n')
    expect(withCc).toContain('Bcc: b@x.com\r\n')

    const without = decode(buildRfc2822({ to: ['a@x.com'], subject: 'S', bodyText: 'B' }))
    expect(without).not.toContain('Cc:')
    expect(without).not.toContain('Bcc:')
  })

  it('emits In-Reply-To and References headers for replies', () => {
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'Re: Hello',
        bodyText: 'reply text',
        inReplyTo: '<orig@gmail.com>',
        references: ['<a@gmail.com>', '<orig@gmail.com>']
      })
    )
    expect(out).toContain('In-Reply-To: <orig@gmail.com>\r\n')
    expect(out).toContain('References: <a@gmail.com> <orig@gmail.com>\r\n')
  })

  it('encodes non-ASCII subjects via RFC 2047', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'Héllo', bodyText: 'b' }))
    expect(out).toMatch(/Subject: =\?UTF-8\?B\?.+\?=\r\n/)
  })

  it('normalises body line endings to CRLF', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'line1\nline2\rline3\r\nline4' }))
    expect(out).toMatch(/line1\r\nline2\r\nline3\r\nline4$/)
  })

  it('rejects newlines in recipient lists (header-injection guard)', () => {
    expect(() => buildRfc2822({ to: ['ok@x.com', 'bad@x.com\r\nBcc: secret@x.com'], subject: 'S', bodyText: 'b' })).toThrow(
      /header injection/
    )
  })

  it('rejects newlines in cc / bcc', () => {
    expect(() => buildRfc2822({ to: ['ok@x.com'], cc: ['a\nb'], subject: 'S', bodyText: 'b' })).toThrow(/header injection/)
    expect(() => buildRfc2822({ to: ['ok@x.com'], bcc: ['a\r\nx'], subject: 'S', bodyText: 'b' })).toThrow(/header injection/)
  })

  it('rejects newlines in subject', () => {
    expect(() => buildRfc2822({ to: ['x@y.com'], subject: 'a\r\nBcc: x', bodyText: 'b' })).toThrow(/header injection/)
  })

  it('rejects an empty recipient list', () => {
    expect(() => buildRfc2822({ to: [], subject: 'S', bodyText: 'b' })).toThrow(/At least one `to` recipient is required/)
  })
})

describe('buildRfc2822 (with attachments)', () => {
  const att = { filename: 'doc.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF-CONTENT') }

  it('switches to multipart/mixed and emits the body as the first part', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'body text', attachments: [att] }))
    expect(out).toMatch(/Content-Type: multipart\/mixed; boundary="BOUNDARY_/)
    expect(out).toContain('Content-Type: text/plain; charset=UTF-8\r\n')
    expect(out).toContain('body text\r\n')
  })

  it('emits each attachment as a base64-encoded part with Content-Disposition: attachment', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'body', attachments: [att] }))
    expect(out).toContain('Content-Type: application/pdf\r\n')
    expect(out).toContain('Content-Disposition: attachment; filename="doc.pdf"\r\n')
    expect(out).toContain('Content-Transfer-Encoding: base64\r\n')
    expect(out).toContain(Buffer.from('PDF-CONTENT').toString('base64'))
  })

  it('round-trips binary content through base64 (line-wrapped at 76 chars)', () => {
    const binary = Buffer.from([0x00, 0xff, ...Array(300).fill(0x55)])
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'S',
        bodyText: 'b',
        attachments: [{ filename: 'b.bin', mimeType: 'application/octet-stream', data: binary }]
      })
    )
    // Find the base64 block (between blank line and the closing boundary).
    const start = out.indexOf('Content-Transfer-Encoding: base64\r\n\r\n', out.indexOf('application/octet-stream'))
    const end = out.indexOf('--', start)
    const b64Block = out
      .slice(start + 'Content-Transfer-Encoding: base64\r\n\r\n'.length, end)
      .trim()
      .replace(/\r\n/g, '')
    expect(Buffer.from(b64Block, 'base64').equals(binary)).toBe(true)
    // Lines should be at most 76 chars.
    for (const line of out
      .slice(start + 'Content-Transfer-Encoding: base64\r\n\r\n'.length, end)
      .trim()
      .split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('emits a closing boundary marker', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'b', attachments: [att] }))
    const boundaryMatch = out.match(/boundary="([^"]+)"/)
    if (!boundaryMatch) throw new Error('expected a boundary in the message headers')
    expect(out).toContain(`--${boundaryMatch[1]}--\r\n`)
  })

  it('supports multiple attachments', () => {
    const att2 = { filename: 'b.txt', mimeType: 'text/plain', data: Buffer.from('hi') }
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'b', attachments: [att, att2] }))
    expect(out).toContain('filename="doc.pdf"')
    expect(out).toContain('filename="b.txt"')
  })

  it('handles non-ASCII filenames with both legacy filename="..." and RFC 5987 filename*= forms', () => {
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'S',
        bodyText: 'b',
        attachments: [{ filename: 'résumé.pdf', mimeType: 'application/pdf', data: Buffer.from('x') }]
      })
    )
    expect(out).toMatch(/filename="=\?UTF-8\?B\?.+\?="/)
    expect(out).toMatch(/filename\*=utf-8''r%C3%A9sum%C3%A9\.pdf/)
  })

  it('escapes backslash and quote in ASCII filenames', () => {
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'S',
        bodyText: 'b',
        attachments: [{ filename: 'a"b\\c.pdf', mimeType: 'application/pdf', data: Buffer.from('x') }]
      })
    )
    expect(out).toContain('filename="a\\"b\\\\c.pdf"')
  })
})

describe('buildRfc2822 (recipient name encoding)', () => {
  it('encodes a non-ASCII display name in `to`', () => {
    const out = decode(buildRfc2822({ to: ['日本語 <a@b.com>'], subject: 'S', bodyText: 'b' }))
    expect(out).toMatch(/To: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@b\.com>\r\n/)
  })

  it('encodes a non-ASCII display name in `cc` and `bcc`', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], cc: ['Héllo <h@w.com>'], bcc: ['Wörld <w@x.com>'], subject: 'S', bodyText: 'b' }))
    expect(out).toMatch(/Cc: =\?UTF-8\?B\?.+\?= <h@w\.com>\r\n/)
    expect(out).toMatch(/Bcc: =\?UTF-8\?B\?.+\?= <w@x\.com>\r\n/)
  })

  it('mixes encoded + bare addresses in the same list with comma-space separators', () => {
    const out = decode(buildRfc2822({ to: ['日本語 <a@b.com>', 'plain@c.com'], subject: 'S', bodyText: 'b' }))
    expect(out).toMatch(/To: =\?UTF-8\?B\?.+\?= <a@b\.com>, plain@c\.com\r\n/)
  })
})

describe('buildRfc2822 (HTML body)', () => {
  it('emits a single-part text/html message when only bodyHtml is provided', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyHtml: '<p>hi</p>' }))
    expect(out).toContain('Content-Type: text/html; charset=UTF-8\r\n')
    expect(out).toContain('Content-Transfer-Encoding: 8bit\r\n')
    expect(out).toContain('<p>hi</p>')
    // No multipart wrapping
    expect(out).not.toContain('multipart/')
  })

  it('emits multipart/alternative with text first, html second when both bodies are provided', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'plain', bodyHtml: '<p>html</p>' }))
    expect(out).toMatch(/Content-Type: multipart\/alternative; boundary="ALT_BOUNDARY_[^"]+"/)
    // RFC 2046 says least-preferred alternative first, so text/plain precedes text/html.
    const plainIdx = out.indexOf('Content-Type: text/plain')
    const htmlIdx = out.indexOf('Content-Type: text/html')
    expect(plainIdx).toBeGreaterThan(-1)
    expect(htmlIdx).toBeGreaterThan(-1)
    expect(plainIdx).toBeLessThan(htmlIdx)
    expect(out).toContain('plain')
    expect(out).toContain('<p>html</p>')
    // closing boundary present
    expect(out).toMatch(/--ALT_BOUNDARY_[\w-]+--\r\n$/)
  })

  it('wraps multipart/alternative inside multipart/mixed when attachments are also present', () => {
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'S',
        bodyText: 'plain',
        bodyHtml: '<p>html</p>',
        attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF') }]
      })
    )
    expect(out).toMatch(/Content-Type: multipart\/mixed; boundary="BOUNDARY_[^"]+"/)
    expect(out).toMatch(/Content-Type: multipart\/alternative; boundary="ALT_BOUNDARY_[^"]+"/)
    // The alternative part appears before the attachment part within the mixed wrapper.
    const altIdx = out.indexOf('multipart/alternative')
    const attIdx = out.indexOf('Content-Disposition: attachment')
    expect(altIdx).toBeLessThan(attIdx)
    // Both bodies and the attachment are present.
    expect(out).toContain('plain')
    expect(out).toContain('<p>html</p>')
    expect(out).toContain(Buffer.from('PDF').toString('base64'))
  })

  it('emits multipart/mixed with text/html body part when only bodyHtml + attachments', () => {
    const out = decode(
      buildRfc2822({
        to: ['x@y.com'],
        subject: 'S',
        bodyHtml: '<p>only html</p>',
        attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF') }]
      })
    )
    expect(out).toMatch(/Content-Type: multipart\/mixed/)
    // No alternative wrapper since bodyText is absent.
    expect(out).not.toContain('multipart/alternative')
    expect(out).toContain('Content-Type: text/html; charset=UTF-8')
    expect(out).toContain('<p>only html</p>')
    expect(out).toContain('Content-Disposition: attachment')
  })

  it('treats empty bodyHtml ("") as not-provided (does NOT switch to multipart)', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: 'text-only', bodyHtml: '' }))
    expect(out).not.toContain('multipart/')
    expect(out).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(out).toContain('text-only')
  })

  it('preserves the back-compat empty bodyText case ("" still produces an empty text/plain body)', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyText: '' }))
    expect(out).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(out).not.toContain('multipart/')
  })

  it('throws when neither bodyText nor bodyHtml is provided', () => {
    expect(() => buildRfc2822({ to: ['x@y.com'], subject: 'S' })).toThrow(/At least one of `bodyText` or `bodyHtml`/)
  })

  it('normalises HTML body line endings to CRLF', () => {
    const out = decode(buildRfc2822({ to: ['x@y.com'], subject: 'S', bodyHtml: '<p>a</p>\n<p>b</p>' }))
    expect(out).toContain('<p>a</p>\r\n<p>b</p>')
  })
})
