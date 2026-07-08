import { describe, expect, it } from 'vitest'
import { errorResult, jsonResult, textResult } from './results.js'

describe('textResult', () => {
  it('returns the MCP text-content shape', () => {
    expect(textResult('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] })
  })

  it('does not set isError', () => {
    const r = textResult('ok')
    expect('isError' in r).toBe(false)
  })
})

describe('jsonResult', () => {
  it('serialises a payload as JSON in a text-content array', () => {
    const r = jsonResult({ x: 1, y: 'two' })
    expect(r.content).toHaveLength(1)
    expect(r.content[0].type).toBe('text')
    expect(JSON.parse(r.content[0].text)).toEqual({ x: 1, y: 'two' })
  })

  it('handles null and primitive payloads', () => {
    expect(JSON.parse(jsonResult(null).content[0].text)).toBeNull()
    expect(JSON.parse(jsonResult(42).content[0].text)).toBe(42)
  })

  it('does not set isError', () => {
    expect('isError' in jsonResult({})).toBe(false)
  })
})

describe('errorResult', () => {
  it('sets isError and prefixes the action label', () => {
    const r = errorResult('listing labels', new Error('boom'))
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe('Error listing labels: boom')
  })

  it('uses the GaxiosError-aware errMessage extraction', () => {
    const err = { response: { status: 404, data: { error: { message: 'Not found' } } } }
    const r = errorResult('getting message', err)
    expect(r.content[0].text).toBe('Error getting message: HTTP 404: Not found')
  })

  it('accepts non-Error throwables', () => {
    expect(errorResult('x', 'string error').content[0].text).toBe('Error x: string error')
  })
})
