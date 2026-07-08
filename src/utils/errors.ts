interface GaxiosShape {
  message?: string
  status?: number
  code?: string | number
  response?: {
    status?: number
    data?: { error?: { message?: string; code?: number } }
  }
}

// Appended to error messages when Gmail returns 401, so callers see the
// remedy in-line rather than a bare HTTP code.
const AUTH_HINT = 'Run the `gsuite_auth_start` tool to refresh the OAuth token.'

const withAuthHint = (status: number | undefined, msg: string): string => (status === 401 ? `${msg} — ${AUTH_HINT}` : msg)

export const errMessage = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const e = error as GaxiosShape
    const status = e.response?.status ?? e.status ?? (typeof e.code === 'string' && /^\d+$/.test(e.code) ? Number(e.code) : undefined)
    const apiMsg = e.response?.data?.error?.message
    if (status && apiMsg) return withAuthHint(status, `HTTP ${status}: ${apiMsg}`)
    if (status && e.message) return withAuthHint(status, `HTTP ${status}: ${e.message}`)
    if (apiMsg) return apiMsg
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
