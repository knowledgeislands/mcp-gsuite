/**
 * The protected list: labels the server refuses to change, whoever calls.
 *
 * One TOML file per account, named by `MCP_GSUITE_PROTECTED_FILE` and read
 * afresh on every check, so an edit takes effect on the next call. Entries are
 * held by label id, so a rename does not lift them; `subtree` (default true)
 * extends an entry to every label whose name sits beneath its current name.
 *
 * - No file: nothing is enforced and writes behave as before.
 * - `enforce = false`: reported as not enforced; writes behave as before.
 * - A file that cannot be read, parsed or validated, or an entry id that no
 *   longer resolves: not enforced, and every guarded write is refused until the
 *   file is fixed.
 *
 * There is no override argument and no bypass setting: the only way to lift
 * protection is to edit the file.
 */
import fs from 'node:fs'
import type { gmail_v1 } from 'googleapis'
import { parse } from 'smol-toml'
import { z } from 'zod'
import type { Config } from '../../config/index.js'
import { jsonResult } from '../../utils/results.js'
import { gmailService } from '../google-client/index.js'

export const PROTECTED_REFUSED = 'PROTECTED_REFUSED'
export const PROTECTED_LIST_INVALID = 'PROTECTED_LIST_INVALID'

const entrySchema = z
  .object({
    kind: z.literal('label'),
    id: z.string().min(1),
    name: z.string().optional(),
    subtree: z.boolean().default(true),
    reason: z.string().optional()
  })
  .strict()

const fileSchema = z
  .object({
    version: z.literal(1),
    enforce: z.boolean().default(true),
    protected: z.array(entrySchema).default([])
  })
  .strict()

type FileEntry = z.infer<typeof entrySchema>

type FileState =
  | { status: 'absent'; source: string | null }
  | { status: 'disabled'; source: string; entries: FileEntry[] }
  | { status: 'invalid'; source: string; error: string }
  | { status: 'enforced'; source: string; entries: FileEntry[] }

/** Read and validate the list file. Never throws: every failure is a state. */
export const readProtectedFile = (file: string | null): FileState => {
  if (!file) return { status: 'absent', source: null }
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent', source: file }
    return { status: 'invalid', source: file, error: `cannot read the file: ${(err as Error).message}` }
  }
  let raw: unknown
  try {
    raw = parse(text)
  } catch (err) {
    return { status: 'invalid', source: file, error: `not valid TOML: ${(err as Error).message}` }
  }
  const checked = fileSchema.safeParse(raw)
  if (!checked.success) {
    const detail = checked.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { status: 'invalid', source: file, error: `not a valid protected list: ${detail}` }
  }
  const { enforce, protected: entries } = checked.data
  return enforce ? { status: 'enforced', source: file, entries } : { status: 'disabled', source: file, entries }
}

export interface ResolvedEntry {
  kind: 'label'
  id: string
  /** The file's name for people, or the current name when the file gives none. */
  name: string
  /** The label's name in Gmail now. */
  current_name: string
  subtree: boolean
  reason?: string
  covers: Array<{ id: string; name: string }>
}

export type Protection =
  | { mode: 'open'; source: string | null; entries: FileEntry[] }
  | { mode: 'blocked'; source: string; error: string; entries: FileEntry[] }
  | { mode: 'enforced'; source: string; entries: ResolvedEntry[]; byLabelId: Map<string, ResolvedEntry> }

type Gmail = gmail_v1.Gmail

const lower = (s: string) => s.toLowerCase()
const isBeneath = (name: string, parent: string) => lower(name).startsWith(`${lower(parent)}/`)

/**
 * Resolve the list against the mailbox's labels: one `labels.list` call. A
 * Gmail error propagates, so a guarded write never proceeds on a failed check.
 */
export const resolveProtection = async (cfg: Config, gmail: () => Gmail): Promise<Protection> => {
  const state = readProtectedFile(cfg.protectedFile ?? null)
  if (state.status === 'absent') return { mode: 'open', source: state.source, entries: [] }
  if (state.status === 'disabled') return { mode: 'open', source: state.source, entries: state.entries }
  if (state.status === 'invalid') return { mode: 'blocked', source: state.source, error: state.error, entries: [] }

  const labels = (await gmail().users.labels.list({ userId: 'me' })).data.labels ?? []
  const all = labels.map((l) => ({ id: l.id ?? '', name: l.name ?? '' }))
  const entries: ResolvedEntry[] = []
  const missing: string[] = []
  for (const e of state.entries) {
    const label = all.find((l) => l.id === e.id)
    if (!label) {
      missing.push(e.name ? `${e.id} (${e.name})` : e.id)
      continue
    }
    entries.push({
      kind: 'label',
      id: e.id,
      name: e.name ?? label.name,
      current_name: label.name,
      subtree: e.subtree,
      ...(e.reason ? { reason: e.reason } : {}),
      covers: e.subtree ? all.filter((l) => l.id !== e.id && isBeneath(l.name, label.name)) : []
    })
  }
  if (missing.length) {
    return {
      mode: 'blocked',
      source: state.source,
      error: `entries no longer resolve to a label: ${missing.join(', ')}`,
      entries: state.entries
    }
  }
  const byLabelId = new Map<string, ResolvedEntry>()
  for (const e of entries) {
    if (!byLabelId.has(e.id)) byLabelId.set(e.id, e)
    for (const c of e.covers) if (!byLabelId.has(c.id)) byLabelId.set(c.id, e)
  }
  return { mode: 'enforced', source: state.source, entries, byLabelId }
}

const fileEntryView = (e: FileEntry) => ({
  kind: e.kind,
  id: e.id,
  name: e.name ?? '',
  current_name: null,
  subtree: e.subtree,
  ...(e.reason ? { reason: e.reason } : {}),
  covers: []
})

/** `gsuite_email_protected_list`: the file, whether it is enforced, and what each entry covers now. */
export const listProtected = async (cfg: Config, now: () => Date = () => new Date()) => {
  const checked_at = now().toISOString()
  const configured = cfg.protectedFile ?? null
  try {
    const p = await resolveProtection(cfg, () => gmailService(cfg.auth))
    if (p.mode === 'enforced') return jsonResult({ enforced: true, source: p.source, entries: p.entries, checked_at })
    return jsonResult({
      enforced: false,
      source: p.source,
      ...(p.mode === 'blocked' ? { error: p.error } : {}),
      entries: p.entries.map(fileEntryView),
      checked_at
    })
  } catch (err) {
    return jsonResult({
      enforced: false,
      source: configured,
      error: `could not resolve the list: ${(err as Error).message}`,
      entries: [],
      checked_at
    })
  }
}

/** What a write would touch. Each kind is checked against the resolved list. */
export interface WriteTargets {
  /** Messages the call changes: each one's labels are read before the write. */
  messageIds?: string[]
  /** Threads the call changes: every message's labels are read before the write. */
  threadIds?: string[]
  /** Label ids the call adds, removes, renames, deletes or names in a filter action. */
  labelIds?: string[]
  /** Label names the call creates, or renames a label to. */
  labelNames?: string[]
  /** Gmail queries whose `label:` and `in:` terms are checked. */
  queries?: string[]
}

interface Hit {
  target: string
  entry: ResolvedEntry
}

const LOOKUP_CONCURRENCY = 10

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const normaliseLabelTerm = (s: string) => lower(s.trim()).replace(/[\s/]+/g, '-')

/** The `label:` and `in:` terms of a Gmail query, quoted or bare, negated or not. */
export const queryLabelTerms = (query: string): string[] => {
  const terms: string[] = []
  for (const m of query.matchAll(/(?:^|[\s({])-?(?:label|in):(?:"([^"]*)"|([^\s)}]+))/gi)) {
    terms.push((m[1] ?? m[2]) as string)
  }
  return terms
}

const protectedNames = (entry: ResolvedEntry) => [entry.current_name, ...entry.covers.map((c) => c.name)]

const findHits = async (gmail: Gmail, p: Extract<Protection, { mode: 'enforced' }>, t: WriteTargets) => {
  const hits: Hit[] = []
  for (const id of t.labelIds ?? []) {
    const entry = p.byLabelId.get(id)
    if (entry) hits.push({ target: id, entry })
  }
  for (const name of t.labelNames ?? []) {
    const entry = p.entries.find((e) => protectedNames(e).some((n) => lower(n) === lower(name) || isBeneath(name, n)))
    if (entry) hits.push({ target: name, entry })
  }
  for (const query of t.queries ?? []) {
    for (const term of queryLabelTerms(query)) {
      const wanted = normaliseLabelTerm(term)
      const entry = p.entries.find((e) => protectedNames(e).some((n) => normaliseLabelTerm(n) === wanted))
      if (entry) hits.push({ target: `label:${term}`, entry })
    }
  }
  const carrying = (id: string, labelIds: string[]) => {
    const found = labelIds.find((l) => p.byLabelId.has(l))
    return found ? { target: id, entry: p.byLabelId.get(found) as ResolvedEntry } : null
  }
  const messageHits = await mapLimit(t.messageIds ?? [], LOOKUP_CONCURRENCY, async (id) => {
    const res = await gmail.users.messages.get({ userId: 'me', id, format: 'minimal' })
    return carrying(id, res.data.labelIds ?? [])
  })
  const threadHits = await mapLimit(t.threadIds ?? [], LOOKUP_CONCURRENCY, async (id) => {
    const res = await gmail.users.threads.get({ userId: 'me', id, format: 'minimal' })
    return carrying(
      id,
      (res.data.messages ?? []).flatMap((m) => m.labelIds ?? [])
    )
  })
  for (const h of [...messageHits, ...threadHits]) if (h) hits.push(h)
  return hits
}

const refusalResult = (text: string, body: Record<string, unknown>) => ({
  resultType: 'complete' as const,
  isError: true as const,
  structuredContent: body,
  content: [{ type: 'text' as const, text: `${text}\n${JSON.stringify(body)}` }]
})

const entryRef = (e: ResolvedEntry) => ({ kind: e.kind, id: e.id, name: e.name })

/**
 * Check a write against the protected list before any change reaches Gmail.
 * Returns null when the write may proceed, or the refusal to return instead.
 * All or nothing: one protected target refuses the whole call, naming every
 * refused target. Gmail errors during the check propagate to the caller's
 * `errorResult`, so the write does not run.
 */
export const guardWrite = async (cfg: Config, tool: string, targets: WriteTargets) => {
  let gmail: Gmail | undefined
  const client = () => {
    gmail ??= gmailService(cfg.auth)
    return gmail
  }
  const p = await resolveProtection(cfg, client)
  if (p.mode === 'open') return null
  if (p.mode === 'blocked') {
    const body = { code: PROTECTED_LIST_INVALID, tool, source: p.source, error: p.error }
    return refusalResult(
      `Error ${tool}: ${PROTECTED_LIST_INVALID}: the protected list at ${p.source} is not usable (${p.error}); every protected-list write is refused until it is fixed.`,
      body
    )
  }
  const hits = await findHits(client(), p, targets)
  if (!hits.length) return null
  const entries = [...new Map(hits.map((h) => [h.entry.id, entryRef(h.entry)])).values()]
  const refused = [...new Set(hits.map((h) => h.target))]
  const first = hits[0] as Hit
  const body = { code: PROTECTED_REFUSED, tool, entry: entryRef(first.entry), entries, targets: refused }
  return refusalResult(
    `Error ${tool}: ${PROTECTED_REFUSED}: ${refused.length} target(s) are protected by ${first.entry.name} (${first.entry.id}): ${refused.join(', ')}. Nothing was changed; only editing the protected list lifts protection.`,
    body
  )
}
