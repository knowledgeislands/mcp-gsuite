import type { gmail_v1 } from 'googleapis'
import { describe, expect, it } from 'vitest'
import { decodeBase64Url, extractAttachments, extractBody, hasAttachments, headerValue, normaliseQueryLabels } from './parse.js'

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')

describe('normaliseQueryLabels', () => {
  it('rewrites a quoted label name to the hyphenated form Gmail expects', () => {
    expect(normaliseQueryLabels('label:"Matters/Criminal - False Allegations"')).toBe('label:Matters/Criminal---False-Allegations')
  })

  it('preserves slashes (nesting) and existing hyphens, replacing only spaces', () => {
    expect(normaliseQueryLabels('label:"_INBOUND/Read Later"')).toBe('label:_INBOUND/Read-Later')
  })

  it('handles a negated quoted label (`-label:"..."`)', () => {
    expect(normaliseQueryLabels('-label:"Foo Bar"')).toBe('-label:Foo-Bar')
  })

  it('rewrites a quoted label appearing mid-query, keeping the rest intact', () => {
    expect(normaliseQueryLabels('from:a@b.com label:"Foo Bar" newer_than:7d')).toBe('from:a@b.com label:Foo-Bar newer_than:7d')
  })

  it('rewrites a quoted label immediately after an opening paren', () => {
    expect(normaliseQueryLabels('(label:"Foo Bar")')).toBe('(label:Foo-Bar)')
  })

  it('rewrites multiple quoted labels in one query', () => {
    expect(normaliseQueryLabels('label:"Foo Bar" OR label:"Baz Qux"')).toBe('label:Foo-Bar OR label:Baz-Qux')
  })

  it('leaves an unquoted label untouched (already valid, or unrepairable with spaces)', () => {
    expect(normaliseQueryLabels('label:newsletter')).toBe('label:newsletter')
  })

  it('leaves a query with no label operator untouched', () => {
    expect(normaliseQueryLabels('from:foo has:attachment')).toBe('from:foo has:attachment')
  })

  it('does not treat a quoted string inside another operator as a label', () => {
    expect(normaliseQueryLabels('subject:"label:not an operator"')).toBe('subject:"label:not an operator"')
  })
})

describe('decodeBase64Url', () => {
  it('decodes base64url-encoded UTF-8 text', () => {
    expect(decodeBase64Url(b64('hello'))).toBe('hello')
  })

  it('handles UTF-8 multibyte characters', () => {
    expect(decodeBase64Url(b64('café — naïve'))).toBe('café — naïve')
  })

  it('handles base64url-specific characters (- and _)', () => {
    // base64url uses '-' and '_' instead of '+' and '/'
    const encoded = Buffer.from('subjects?').toString('base64url')
    expect(decodeBase64Url(encoded)).toBe('subjects?')
  })

  it('returns empty string for empty input', () => {
    expect(decodeBase64Url('')).toBe('')
  })
})

describe('headerValue', () => {
  const headers: gmail_v1.Schema$MessagePartHeader[] = [
    { name: 'Subject', value: 'Hello world' },
    { name: 'From', value: 'alice@example.com' },
    { name: 'To', value: 'bob@example.com' }
  ]

  it('returns the value when header is present', () => {
    expect(headerValue(headers, 'Subject')).toBe('Hello world')
  })

  it('is case-insensitive on the header name', () => {
    expect(headerValue(headers, 'subject')).toBe('Hello world')
    expect(headerValue(headers, 'SUBJECT')).toBe('Hello world')
    expect(headerValue(headers, 'sUbJeCt')).toBe('Hello world')
  })

  it('returns empty string when header is missing', () => {
    expect(headerValue(headers, 'Cc')).toBe('')
  })

  it('returns empty string when headers is undefined', () => {
    expect(headerValue(undefined, 'Subject')).toBe('')
  })

  it('returns empty string when headers is an empty array', () => {
    expect(headerValue([], 'Subject')).toBe('')
  })

  it('returns the first match when multiple headers share a name (Received-style)', () => {
    const dupes: gmail_v1.Schema$MessagePartHeader[] = [
      { name: 'Received', value: 'first' },
      { name: 'Received', value: 'second' }
    ]
    expect(headerValue(dupes, 'Received')).toBe('first')
  })

  it('returns empty string when the header value is missing', () => {
    expect(headerValue([{ name: 'X-Custom' }], 'X-Custom')).toBe('')
  })
})

describe('extractBody', () => {
  it('returns empty string for undefined payload', () => {
    expect(extractBody(undefined)).toBe('')
  })

  it('decodes a single-part text/plain message body directly from payload', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: b64('Hello plain world') }
    }
    expect(extractBody(payload)).toBe('Hello plain world')
  })

  it('strips HTML when the single-part body is text/html', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: b64(html) }
    }
    expect(extractBody(payload)).toBe('Hello world')
  })

  it('prefers text/plain when both text/plain and text/html parts exist', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('Plain version') } },
        { mimeType: 'text/html', body: { data: b64('<p>HTML version</p>') } }
      ]
    }
    expect(extractBody(payload)).toBe('Plain version')
  })

  it('falls back to text/html (stripped) when no text/plain part exists', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/html', body: { data: b64('<p>Hello <em>world</em></p>') } }]
    }
    expect(extractBody(payload)).toBe('Hello world')
  })

  it('walks nested multipart trees to find text/plain', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Nested plain') } },
            { mimeType: 'text/html', body: { data: b64('<p>Nested html</p>') } }
          ]
        },
        { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'A1', size: 100 } }
      ]
    }
    expect(extractBody(payload)).toBe('Nested plain')
  })

  it('removes <script> and <style> blocks entirely when stripping HTML', () => {
    const html = '<style>.x{color:red}</style><script>alert(1)</script><p>Visible</p>'
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: b64(html) }
    }
    const out = extractBody(payload)
    expect(out).toBe('Visible')
    expect(out).not.toMatch(/script/i)
    expect(out).not.toMatch(/style/i)
  })

  it('decodes HTML entities in the stripped output', () => {
    const html = '<p>Tom &amp; Jerry &lt;3 &nbsp;&quot;hi&quot;</p>'
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: b64(html) }
    }
    expect(extractBody(payload)).toBe('Tom & Jerry <3  "hi"')
  })

  it('returns empty string when no parts and no body.data', () => {
    const payload: gmail_v1.Schema$MessagePart = { mimeType: 'text/plain', body: {} }
    expect(extractBody(payload)).toBe('')
  })

  it('returns empty string when multipart payload has no text parts', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'A1', size: 100 } }]
    }
    expect(extractBody(payload)).toBe('')
  })
})

describe('extractAttachments', () => {
  it('returns empty array for undefined payload', () => {
    expect(extractAttachments(undefined)).toEqual([])
  })

  it('extracts a single attachment from a multipart payload', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('hi') } },
        { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { attachmentId: 'A1', size: 12345 } }
      ]
    }
    expect(extractAttachments(payload)).toEqual([{ attachmentId: 'A1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 12345 }])
  })

  it('extracts multiple attachments and walks nested parts', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/related',
          parts: [
            { mimeType: 'text/html', body: { data: b64('<p>x</p>') } },
            { mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'A2', size: 4096 } }
          ]
        },
        { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { attachmentId: 'A1', size: 12345 } }
      ]
    }
    const out = extractAttachments(payload)
    expect(out).toHaveLength(2)
    expect(out.map((a) => a.filename).sort()).toEqual(['invoice.pdf', 'logo.png'])
  })

  it('skips parts without a filename (e.g. inline parts)', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        // Inline image: has attachmentId but no filename
        { mimeType: 'image/png', body: { attachmentId: 'INLINE', size: 1024 } },
        // True attachment
        { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'REAL', size: 5000 } }
      ]
    }
    expect(extractAttachments(payload)).toEqual([{ attachmentId: 'REAL', filename: 'doc.pdf', mimeType: 'application/pdf', size: 5000 }])
  })

  it('defaults mimeType to application/octet-stream when missing', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [{ filename: 'opaque.bin', body: { attachmentId: 'X', size: 0 } }]
    }
    expect(extractAttachments(payload)[0]?.mimeType).toBe('application/octet-stream')
  })

  it('defaults size to 0 when missing', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [{ filename: 'x', mimeType: 'application/octet-stream', body: { attachmentId: 'X' } }]
    }
    expect(extractAttachments(payload)[0]?.size).toBe(0)
  })

  it('returns empty array when no parts have attachmentIds', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('hi') } },
        { mimeType: 'text/html', body: { data: b64('<p>hi</p>') } }
      ]
    }
    expect(extractAttachments(payload)).toEqual([])
  })
})

describe('hasAttachments', () => {
  it('returns false for undefined payload', () => {
    expect(hasAttachments(undefined)).toBe(false)
  })

  it('returns true when a part has filename + attachmentId', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [{ filename: 'a.pdf', mimeType: 'application/pdf', body: { attachmentId: 'A1', size: 1 } }]
    }
    expect(hasAttachments(payload)).toBe(true)
  })

  it('returns false when there are no attachments', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: b64('hi') }
    }
    expect(hasAttachments(payload)).toBe(false)
  })

  it('returns false for inline parts without filenames', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/related',
      parts: [{ mimeType: 'image/png', body: { attachmentId: 'INLINE', size: 100 } }]
    }
    expect(hasAttachments(payload)).toBe(false)
  })

  it('walks nested parts', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/related',
          parts: [{ mimeType: 'application/pdf', filename: 'deep.pdf', body: { attachmentId: 'DEEP', size: 1 } }]
        }
      ]
    }
    expect(hasAttachments(payload)).toBe(true)
  })
})
