import type { Config } from '../../config/index.js'
import { errorResult, jsonResult } from '../../utils/results.js'
import { gmailService } from '../google-client/index.js'

export interface FilterInput {
  criteria: {
    from?: string
    to?: string
    subject?: string
    query?: string
    negatedQuery?: string
  }
  action: {
    addLabelId?: string
    skipInbox?: boolean
    markRead?: boolean
  }
  dry_run: boolean
}

const definition = (input: FilterInput) => {
  const criteria = Object.fromEntries(
    (['from', 'to', 'subject', 'query', 'negatedQuery'] as const)
      .filter((key) => input.criteria[key]?.trim())
      .map((key) => [key, input.criteria[key]?.trim()])
  )
  const action = {
    ...(input.action.addLabelId ? { addLabelIds: [input.action.addLabelId] } : {}),
    removeLabelIds: [input.action.skipInbox ? 'INBOX' : '', input.action.markRead ? 'UNREAD' : ''].filter(Boolean)
  }
  if (!Object.keys(criteria).length) throw new Error('At least one matching criterion is required.')
  if (!input.action.addLabelId && !action.removeLabelIds.length) throw new Error('At least one action is required.')
  return { criteria, action }
}

const equivalent = (a: object, b: object) => {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  return (
    Object.keys(left).every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key])) &&
    Object.keys(right).every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]))
  )
}

export const listFilters = async (cfg: Config) => {
  try {
    const res = await gmailService(cfg.auth).users.settings.filters.list({ userId: 'me' })
    return jsonResult({ filters: res.data.filter ?? [] })
  } catch (err) {
    return errorResult('listing filters', err)
  }
}

export const createFilter = async (cfg: Config, input: FilterInput) => {
  try {
    const desired = definition(input)
    const gmail = gmailService(cfg.auth)
    const current = (await gmail.users.settings.filters.list({ userId: 'me' })).data.filter ?? []
    const sameCriteria = current.filter((filter) => equivalent(filter.criteria ?? {}, desired.criteria))
    const existing = sameCriteria.find((filter) =>
      equivalent(
        {
          addLabelIds: filter.action?.addLabelIds ?? [],
          removeLabelIds: filter.action?.removeLabelIds ?? []
        },
        {
          addLabelIds: desired.action.addLabelIds ?? [],
          removeLabelIds: desired.action.removeLabelIds
        }
      )
    )
    if (sameCriteria.length && !existing) {
      throw new Error(
        `A filter with these criteria already exists (id: ${sameCriteria[0]?.id ?? 'unknown'}); review it before creating another.`
      )
    }
    if (input.dry_run || existing) {
      return jsonResult({
        dry_run: input.dry_run,
        created: false,
        existingFilterId: existing?.id ?? null,
        filter: desired
      })
    }
    const res = await gmail.users.settings.filters.create({ userId: 'me', requestBody: desired })
    return jsonResult({ dry_run: false, created: true, existingFilterId: null, filter: res.data })
  } catch (err) {
    return errorResult('creating filter', err)
  }
}

export const deleteFilter = async (cfg: Config, { filterId, dry_run }: { filterId: string; dry_run: boolean }) => {
  try {
    const gmail = gmailService(cfg.auth)
    const existing = await gmail.users.settings.filters.get({ userId: 'me', id: filterId })
    if (dry_run) return jsonResult({ dry_run: true, deleted: false, filter: existing.data })
    await gmail.users.settings.filters.delete({ userId: 'me', id: filterId })
    return jsonResult({ dry_run: false, deleted: true, filter: existing.data })
  } catch (err) {
    return errorResult('deleting filter', err)
  }
}
