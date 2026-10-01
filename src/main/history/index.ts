/** Read-only mailbox history checkpoints and incremental changes. */
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { gmailService } from '../google-client/index.js'

const decimalHistoryId = z.string().regex(/^\d+$/)
const messageRef = z.object({ id: z.string().optional(), threadId: z.string().optional() })
const messageEvent = z.object({ message: messageRef })
const labelEvent = z.object({ message: messageRef, labelIds: z.array(z.string()) })

export const historyResponseSchema = z.object({
  historyId: decimalHistoryId,
  nextPageToken: z.string().optional(),
  history: z
    .array(
      z.object({
        id: decimalHistoryId,
        messages: z.array(messageRef).optional(),
        messagesAdded: z.array(messageEvent).default([]),
        messagesDeleted: z.array(messageEvent).default([]),
        labelsAdded: z.array(labelEvent).default([]),
        labelsRemoved: z.array(labelEvent).default([])
      })
    )
    .default([])
})

export const historyCheckpoint = async (cfg: Config) => {
  try {
    const profile = await gmailService(cfg.auth).users.getProfile({ userId: 'me' })
    return jsonResult({ historyId: decimalHistoryId.parse(profile.data.historyId) })
  } catch (error) {
    return errorResult('getting Gmail history checkpoint', error)
  }
}

export const historyList = async (
  cfg: Config,
  { startHistoryId, maxResults, pageToken }: { startHistoryId: string; maxResults?: number; pageToken?: string }
) => {
  try {
    const response = await gmailService(cfg.auth).users.history.list({
      userId: 'me',
      startHistoryId,
      maxResults,
      pageToken
    })
    return jsonResult(historyResponseSchema.parse(response.data))
  } catch (error) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status
    if (status === 404) {
      return errorResult(
        'listing Gmail history',
        new Error(
          'History checkpoint expired or invalid. Acquire a fresh mailbox checkpoint before a full search, then replay and drain all history pages before saving the new checkpoint.'
        )
      )
    }
    return errorResult('listing Gmail history', error)
  }
}
