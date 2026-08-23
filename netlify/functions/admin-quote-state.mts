import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { adminGate } from '../lib/auth.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'
import { asQuoteState, isQuoteState } from '../lib/quoteState.js'

/**
 * Moves a published quote between 'issued' and 'paid'. Marking a quote paid is
 * what withdraws the payment link from `access_quote.sh`, so it only applies
 * once a quote row exists — there is nothing to have been paid before that.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const denied = adminGate(req)
  if (denied) return denied

  try {
    return await setState(req)
  } catch (err) {
    console.error('admin-quote-state failed', err)
    return json({ error: 'storage_failed', message: 'could not update the quote state' }, 500)
  }
}

async function setState(req: Request) {
  let body: { ref?: unknown; state?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const ref = normalizeQuoteRef(typeof body.ref === 'string' ? body.ref : '')
  if (!ref) return json({ error: 'unknown_request', message: 'no reference given' }, 404)

  if (!isQuoteState(body.state)) {
    return json({ error: 'invalid_state', message: 'state must be issued or paid' }, 400)
  }
  const state = body.state

  const [request] = await db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.ref, ref))
    .limit(1)
  if (!request) return json({ error: 'unknown_request', message: 'no such reference' }, 404)

  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.requestId, request.id))
    .limit(1)
  if (!quote) {
    return json(
      { error: 'not_published', message: 'publish the quote before marking it paid' },
      409,
    )
  }

  // `updatedAt` is deliberately left alone: the record page shows it as the
  // date the quote was issued, and a payment does not re-issue the quote.
  await db.update(quotes).set({ state }).where(eq(quotes.id, quote.id))

  return json({ ok: true, ref: request.ref, state: asQuoteState(state) })
}
