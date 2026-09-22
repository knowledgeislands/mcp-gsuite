import { errMessage } from './errors.js'

// Every helper stamps `resultType: 'complete'`, the MCP 2026-07-28 discriminator
// that marks a synchronous, fully-formed tool result. The SDK validates it on
// the wire and lifts a complete result into the client's stable return shape,
// so a helper that omits it produces a protocol-level failure rather than a
// visible one at the call site.

export const textResult = (text: string) => ({
  resultType: 'complete' as const,
  content: [{ type: 'text' as const, text }]
})

export const jsonResult = (data: unknown) => ({
  resultType: 'complete' as const,
  structuredContent: data as Record<string, unknown>,
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
})

export const errorResult = (action: string, error: unknown) => ({
  resultType: 'complete' as const,
  isError: true as const,
  content: [{ type: 'text' as const, text: `Error ${action}: ${errMessage(error)}` }]
})
