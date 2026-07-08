/**
 * Shared Google client factory — the one seam every Google API goes through.
 *
 * `getAuthorizedClient()` returns the single authorized `google.auth.OAuth2`
 * client (token load, refresh persistence, and caching live in `../auth/`);
 * the per-API factories below are thin wrappers that bind a service to that
 * client. Email uses `gmailService()` today; `calendarService()`,
 * `driveService()`, and `sheetsService()` are ready seams for the calendar and
 * drive/sheets units — no tools use them yet.
 */
import { google } from 'googleapis'
import type { OAuth2Client } from 'googleapis-common'
import type { AuthConfig } from '../../config/index.js'
import { getAuthClient } from '../auth/index.js'

/** The one authorized OAuth2 client (config + persisted token, auto-refresh). */
export const getAuthorizedClient = (auth: AuthConfig): OAuth2Client => getAuthClient(auth)

export const gmailService = (auth: AuthConfig) => google.gmail({ version: 'v1', auth: getAuthorizedClient(auth) })

export const calendarService = (auth: AuthConfig) => google.calendar({ version: 'v3', auth: getAuthorizedClient(auth) })

export const driveService = (auth: AuthConfig) => google.drive({ version: 'v3', auth: getAuthorizedClient(auth) })

export const sheetsService = (auth: AuthConfig) => google.sheets({ version: 'v4', auth: getAuthorizedClient(auth) })
