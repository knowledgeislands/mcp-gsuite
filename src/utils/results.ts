import { errMessage } from './errors.js'

export const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }]
})

export const jsonResult = (data: unknown) => ({
  structuredContent: data as Record<string, unknown>,
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
})

export const errorResult = (action: string, error: unknown) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: `Error ${action}: ${errMessage(error)}` }]
})
