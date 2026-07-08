import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthConfig } from '../../config/index.js'
import { resetAuthClient } from '../auth/index.js'
import { calendarService, driveService, getAuthorizedClient, gmailService, sheetsService } from './index.js'

// Real token file on disk (no mocks) — the factories must all bind to the one
// authorized OAuth2 client that ../auth/ builds from it.
let tmpDir: string
let auth: AuthConfig

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsuite-google-client-'))
  const tokenPath = path.join(tmpDir, 'tokens.json')
  fs.writeFileSync(tokenPath, JSON.stringify({ access_token: 'a', refresh_token: 'r' }))
  auth = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3334/auth/callback',
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    tokenStorePath: tokenPath,
    authServerPort: 3334,
    authServerUrl: 'http://localhost:3334'
  }
  resetAuthClient()
})

afterEach(() => {
  resetAuthClient()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getAuthorizedClient', () => {
  it('returns an OAuth2 client primed with the persisted credentials', () => {
    const client = getAuthorizedClient(auth)
    expect(client.credentials.access_token).toBe('a')
  })
})

describe('service factories', () => {
  it('gmailService returns a Gmail v1 client with users.messages.list etc.', () => {
    const gmail = gmailService(auth)
    expect(typeof gmail.users.messages.list).toBe('function')
    expect(typeof gmail.users.labels.list).toBe('function')
  })

  it('calendarService returns a Calendar v3 client (seam only — no tools yet)', () => {
    expect(typeof calendarService(auth).events.list).toBe('function')
  })

  it('driveService returns a Drive v3 client (seam only — no tools yet)', () => {
    expect(typeof driveService(auth).files.list).toBe('function')
  })

  it('sheetsService returns a Sheets v4 client (seam only — no tools yet)', () => {
    expect(typeof sheetsService(auth).spreadsheets.values.get).toBe('function')
  })
})
