/**
 * Shared input-schema primitives for the Gmail tool layer.
 *
 * Identifier fields (message / thread / draft / label ids) are not free-form
 * strings: Gmail ids and system label names are drawn from `[A-Za-z0-9_-]`. We
 * pin them to that alphabet with a length cap so a malformed or hostile id is
 * rejected at the schema boundary before it reaches the Gmail API (§6.6/§6.9 of
 * the workspace MCP standard). Free-form text (search queries, subject, bodies,
 * label names) stays free-form but length-capped (§6.9).
 */
import { z } from 'zod'

/** Gmail message/thread/draft ids and system label ids fit `[A-Za-z0-9_-]`. */
export const idSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'must contain only letters, digits, underscore, or hyphen')

/**
 * Gmail attachment ids share the `[A-Za-z0-9_-]` alphabet but are opaque and
 * can run to many hundreds of characters — so they get a far larger cap than
 * the short resource ids above.
 */
export const attachmentIdSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+$/, 'must contain only letters, digits, underscore, or hyphen')

/** A Gmail search query: free-form but length-capped to a sane upper bound. */
export const querySchema = z.string().max(2048)

/** Upper bound for unbounded free-text fields (subject, body, label name). */
export const TEXT_MAX = 1_000_000

/** A single line of free text (subject, label name) — capped, no length floor. */
export const shortTextSchema = z.string().max(8192)

/** A message body (plain-text or HTML) — capped well above any sane email. */
export const bodyTextSchema = z.string().max(TEXT_MAX)
