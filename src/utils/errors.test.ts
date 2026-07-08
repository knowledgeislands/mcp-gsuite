import { describe, expect, it } from 'vitest'
import { errMessage } from './errors.js'

describe('errMessage', () => {
  it('returns "<value>" for primitive non-error inputs', () => {
    expect(errMessage('boom')).toBe('boom')
    expect(errMessage(42 as unknown)).toBe('42')
    expect(errMessage(null)).toBe('null')
    expect(errMessage(undefined)).toBe('undefined')
  })

  it('returns Error.message for plain Error instances', () => {
    expect(errMessage(new Error('disk full'))).toBe('disk full')
  })

  describe('GaxiosError shapes', () => {
    it('combines HTTP status (from response.status) with Google API message', () => {
      const err = {
        message: 'Request failed',
        response: { status: 404, data: { error: { message: 'Requested entity was not found.', code: 404 } } }
      }
      expect(errMessage(err)).toBe('HTTP 404: Requested entity was not found.')
    })

    it('falls back to top-level status when response.status is absent', () => {
      const err = { message: 'rate limited', status: 429, response: { data: { error: { message: 'Quota exceeded' } } } }
      expect(errMessage(err)).toBe('HTTP 429: Quota exceeded')
    })

    it('parses numeric string code as HTTP status', () => {
      const err = { code: '403', message: 'Forbidden', response: { data: { error: { message: 'Insufficient Permission' } } } }
      expect(errMessage(err)).toBe('HTTP 403: Insufficient Permission')
    })

    it('uses the top-level message when the Google API message is absent but status is known', () => {
      const err = { message: 'Network connection lost', response: { status: 503 } }
      expect(errMessage(err)).toBe('HTTP 503: Network connection lost')
    })

    it('returns only the Google API message when no status is available', () => {
      const err = { response: { data: { error: { message: 'Invalid grant' } } } }
      expect(errMessage(err)).toBe('Invalid grant')
    })

    it('returns the Error.message when neither status nor API message is present', () => {
      // This is a generic Error with no Gaxios-shaped fields.
      expect(errMessage(new Error('plain old error'))).toBe('plain old error')
    })

    it('does not treat a non-numeric string code as an HTTP status', () => {
      const err = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:80' }
      // Non-numeric code should never get parsed as an HTTP status.
      expect(errMessage(err)).not.toMatch(/^HTTP /)
    })

    it('appends the `gsuite_auth_start` hint on HTTP 401 with an API message', () => {
      const err = { response: { status: 401, data: { error: { message: 'Invalid Credentials' } } } }
      expect(errMessage(err)).toBe('HTTP 401: Invalid Credentials — Run the `gsuite_auth_start` tool to refresh the OAuth token.')
    })

    it('appends the `gsuite_auth_start` hint on HTTP 401 with only a top-level message', () => {
      const err = { message: 'token expired', response: { status: 401 } }
      expect(errMessage(err)).toBe('HTTP 401: token expired — Run the `gsuite_auth_start` tool to refresh the OAuth token.')
    })

    it('does not append the auth hint on non-401 statuses', () => {
      const err = { response: { status: 403, data: { error: { message: 'Insufficient Permission' } } } }
      expect(errMessage(err)).toBe('HTTP 403: Insufficient Permission')
    })
  })

  it('falls back to String(value) for other shapes', () => {
    expect(errMessage({ foo: 'bar' })).toMatch(/object/i)
  })
})
