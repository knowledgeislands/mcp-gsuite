/**
 * Label operations against the Gmail API. Each entry point takes the loaded
 * `Config` as its first argument and obtains an authenticated Gmail client via
 * `gmailService(cfg.auth)`. Usable from a script: `await listLabels(loadConfig())`.
 */
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { gmailService } from '../google-client/index.js'

export const listLabels = async (cfg: Config) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.labels.list({ userId: 'me' })
    const labels = (res.data.labels ?? []).map((l) => ({ id: l.id ?? '', name: l.name ?? '' }))
    // Wrapped in an object (not a bare array) so structuredContent is a valid
    // JSON object per the MCP spec, matching the gsuite_email_labels_list outputSchema.
    return jsonResult({ labels })
  } catch (err) {
    return errorResult('listing labels', err)
  }
}

export const createLabel = async (cfg: Config, { name }: { name: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    })
    return jsonResult({ labelId: res.data.id ?? '', name: res.data.name ?? name })
  } catch (err) {
    return errorResult('creating label', err)
  }
}

export const updateLabel = async (cfg: Config, { labelId, name }: { labelId: string; name: string }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // Gmail's labels.patch lets us rename without re-asserting visibility flags.
    const res = await gmail.users.labels.patch({
      userId: 'me',
      id: labelId,
      requestBody: { name }
    })
    return jsonResult({ labelId: res.data.id ?? labelId, name: res.data.name ?? name })
  } catch (err) {
    return errorResult('updating label', err)
  }
}

export const deleteLabel = async (cfg: Config, { labelId, dry_run }: { labelId: string; dry_run: boolean }) => {
  try {
    const gmail = gmailService(cfg.auth)
    // Gmail removes the label from every message that had it. System labels
    // (INBOX, SENT, etc.) cannot be deleted; Gmail returns 400 in that case.
    if (dry_run) {
      // Look up the label so the caller sees its name and type before deleting.
      const label = await gmail.users.labels.get({ userId: 'me', id: labelId })
      return jsonResult({
        labelId,
        dry_run: true,
        deleted: false,
        would_delete: { labelId, name: label.data.name ?? '', type: label.data.type ?? '' }
      })
    }
    await gmail.users.labels.delete({ userId: 'me', id: labelId })
    return jsonResult({ labelId, dry_run: false, deleted: true })
  } catch (err) {
    return errorResult('deleting label', err)
  }
}
