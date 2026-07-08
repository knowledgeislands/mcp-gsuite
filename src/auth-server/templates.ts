// HTML response templates for the auth server.
// Keep markup here so the request handler stays focused on flow control.

const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const page = (title: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
  `<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#222}` +
  `h1{font-size:1.4rem}h1.ok{color:#1a7f37}h1.err{color:#c0392b}code{background:#f3f3f3;padding:0.1rem 0.3rem;border-radius:3px}` +
  `.box{padding:0.8rem 1rem;border-radius:4px}.box.ok{background:#dafbe1;border:1px solid #a4e3b3}.box.err{background:#ffeaea;border:1px solid #f5b7b7}` +
  `</style></head><body>${body}</body></html>`

export const rootInfo = (port: number): string =>
  page(
    'mcp-gsuite auth',
    `<h1>mcp-gsuite auth server</h1>` +
      `<p>This server handles the Google OAuth callback for the mcp-gsuite MCP server.</p>` +
      `<p>Don't navigate here directly — call the <code>gsuite_auth_start</code> tool from your MCP client to start the flow.</p>` +
      `<p>Listening on <code>http://localhost:${port}</code>.</p>`
  )

export const authSuccess = (): string =>
  page(
    'Authentication successful',
    `<h1 class="ok">Authentication successful</h1>` +
      `<div class="box ok"><p>Tokens were saved. You can close this tab and return to your MCP client.</p></div>`
  )

export const authError = (error: string, description?: string): string =>
  page(
    'Authentication error',
    `<h1 class="err">Authentication error</h1>` +
      `<div class="box err"><p><strong>Error:</strong> <code>${escapeHtml(error)}</code></p>` +
      `${description ? `<p><strong>Description:</strong> ${escapeHtml(description)}</p>` : ''}</div>` +
      `<p>Close this window and retry the <code>gsuite_auth_start</code> tool.</p>`
  )

export const tokenExchangeError = (message: string): string =>
  page(
    'Token exchange failed',
    `<h1 class="err">Token exchange failed</h1><div class="box err"><p>${escapeHtml(message)}</p></div><p>Close this window and retry the <code>gsuite_auth_start</code> tool.</p>`
  )

export const missingCode = (): string =>
  page(
    'Missing authorization code',
    `<h1 class="err">Missing authorization code</h1>` +
      `<div class="box err"><p>The OAuth callback did not include a <code>code</code> parameter.</p></div>`
  )

export const invalidState = (): string =>
  page(
    'Invalid OAuth state',
    `<h1 class="err">Invalid OAuth state</h1>` +
      `<div class="box err"><p>The <code>state</code> parameter did not match a pending request, or expired (10 min TTL).</p></div>` +
      `<p>Restart the flow via the <code>gsuite_auth_start</code> tool.</p>`
  )

export const configError = (): string =>
  page(
    'Server not configured',
    `<h1 class="err">Server not configured</h1>` +
      `<div class="box err"><p>Set <code>MCP_GSUITE_CLIENT_ID</code> and <code>MCP_GSUITE_CLIENT_SECRET</code> in the environment and restart this server.</p></div>`
  )
