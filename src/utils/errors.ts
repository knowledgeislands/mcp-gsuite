interface GaxiosShape {
  message?: string
  status?: number
  code?: string | number
  response?: {
    status?: number
    data?: { error?: { message?: string; code?: number } }
  }
}

// Appended to error messages when Google returns 401, so callers see the
// remedy in-line rather than a bare HTTP code. `gsuite_auth_start` is a write
// tool and is not registered at the default read level, so the hint carries the
// operator's access-level step rather than naming a tool the caller may lack.
export const AUTH_HINT =
  'Re-authenticate with the `gsuite_auth_start` tool. It is a write-level tool: if your client does not list it, ' +
  "set MCP_GSUITE_ACCESS_LEVEL=write in the client's configuration for this server, restart the client, " +
  'run the tool, then set the level back to read if you prefer; the token stays valid.'

const withAuthHint = (status: number | undefined, msg: string): string =>
  status === 401 ? `${msg} — ${AUTH_HINT}` : msg

export const errMessage = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const e = error as GaxiosShape
    const status =
      e.response?.status ??
      e.status ??
      (typeof e.code === 'string' && /^\d+$/.test(e.code) ? Number(e.code) : undefined)
    const apiMsg = e.response?.data?.error?.message
    if (status && apiMsg) return withAuthHint(status, `HTTP ${status}: ${apiMsg}`)
    if (status && e.message) return withAuthHint(status, `HTTP ${status}: ${e.message}`)
    if (apiMsg) return apiMsg
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
