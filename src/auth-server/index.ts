#!/usr/bin/env node
/**
 * Standalone OAuth callback server for the Gmail flow.
 *
 * Listens on `MCP_GSUITE_AUTH_PORT` (default 3334). `/auth` starts the consent flow;
 * `/auth/callback` exchanges the returned code for tokens via the googleapis
 * OAuth2Client and persists them atomically to `config.auth.tokenStorePath`.
 *
 * Tokens are never logged.
 */
import crypto from 'node:crypto'
import http from 'node:http'
import { loadConfig } from '../config/index.js'
import { buildAuthUrl, exchangeAuthCode, generatePkcePair, saveTokensFromAuthFlow } from '../main/auth/index.js'
import * as templates from './templates.js'

const config = loadConfig()
const auth = config.auth

// Each pending flow stores its single-use `state` -> the PKCE code_verifier
// minted for that flow plus the time it was created. The callback can only
// redeem the code with the verifier paired to its exact state.
interface PendingFlow {
  codeVerifier: string
  createdAt: number
}
const pendingStates = new Map<string, PendingFlow>()
const TEN_MINUTES = 10 * 60 * 1000

setInterval(
  () => {
    const now = Date.now()
    for (const [key, flow] of pendingStates.entries()) {
      if (now - flow.createdAt > TEN_MINUTES) pendingStates.delete(key)
    }
  },
  5 * 60 * 1000
).unref()

const exchangeCodeForTokens = async (code: string, codeVerifier: string): Promise<void> => {
  const tokens = await exchangeAuthCode(auth, { code, codeVerifier })
  saveTokensFromAuthFlow(auth, tokens)
  // Never log token values. Acknowledge success via shape only.
  console.error(`Tokens saved (refresh_token=${tokens.refresh_token ? 'yes' : 'no'}, scope=${tokens.scope ?? '<unset>'}).`)
}

const server = http.createServer((req, res) => {
  // `new URL` requires an absolute URL; we only use pathname + searchParams,
  // so the base host is a placeholder. Replaces the deprecated `url.parse()`.
  const parsed = new URL(req.url ?? '/', 'http://localhost')
  const pathname = parsed.pathname

  if (pathname === '/auth/callback') {
    const query = Object.fromEntries(parsed.searchParams) as Record<string, string>

    const flow = query.state ? pendingStates.get(query.state) : undefined
    if (!query.state || !flow) {
      res.writeHead(403, { 'Content-Type': 'text/html' })
      res.end(templates.invalidState())
      return
    }
    pendingStates.delete(query.state)

    if (query.error) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(templates.authError(query.error, query.error_description))
      return
    }

    if (!query.code) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(templates.missingCode())
      return
    }

    exchangeCodeForTokens(query.code, flow.codeVerifier)
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(templates.authSuccess())
      })
      .catch((error: Error) => {
        console.error(`Token exchange error: ${error.message}`)
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(templates.tokenExchangeError(error.message))
      })
    return
  }

  if (pathname === '/auth') {
    if (!auth.clientId || !auth.clientSecret) {
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(templates.configError())
      return
    }

    const state = crypto.randomBytes(32).toString('hex')
    const { codeVerifier, codeChallenge } = generatePkcePair()
    pendingStates.set(state, { codeVerifier, createdAt: Date.now() })

    const authUrl = buildAuthUrl(auth, { state, codeChallenge })

    res.writeHead(302, { Location: authUrl })
    res.end()
    return
  }

  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(templates.rootInfo(auth.authServerPort))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

server.listen(auth.authServerPort, () => {
  console.error(`mcp-gsuite auth server listening on ${auth.authServerUrl}`)
  console.error(`Redirect URI: ${auth.redirectUri}`)
  console.error(`Token store : ${auth.tokenStorePath}`)
  console.error(`Scopes      : ${auth.scopes.join(' ')}`)
  if (!auth.clientId || !auth.clientSecret) {
    console.error('WARNING: MCP_GSUITE_CLIENT_ID and MCP_GSUITE_CLIENT_SECRET are not set.')
  }
})

const shutdown = (): void => {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
