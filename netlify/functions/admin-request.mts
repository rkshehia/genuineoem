import { getStore } from '@netlify/blobs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { adminGate } from '../lib/auth.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'

/**
 * Operates on a single request, where `admin-requests` lists them all.
 * Currently one action: `DELETE ?ref=GO-XXXX-XXX` erases the enquiry outright.
 *
 * This exists so test records filed while checking the pipeline can be cleared
 * out again. It is unrecoverable — the row, its quote and the part photo all
 * go — so the console asks for a second click before calling it.
 */
export default async (req: Request) => {
  if (req.method !== 'DELETE') return methodNotAllowed('DELETE')

  const denied = adminGate(req)
  if (denied) return denied

  try {
    return await remove(req)
  } catch (err) {
    console.error('admin-request delete failed', err)
    return json({ error: 'storage_failed', message: 'could not delete the request' }, 500)
  }
}

async function remove(req: Request) {
  const ref = normalizeQuoteRef(new URL(req.url).searchParams.get('ref') ?? '')
  if (!ref) return json({ error: 'unknown_request', message: 'no reference given' }, 404)

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

  // quotes.request_id references quote_requests.id, so the quote has to go
  // first or the delete below is refused by the foreign key.
  if (quote) await db.delete(quotes).where(eq(quotes.id, quote.id))
  await db.delete(quoteRequests).where(eq(quoteRequests.id, request.id))

  // Best effort, and deliberately last: an orphaned blob costs nothing, but a
  // blob failure that aborted the delete would leave the record in place.
  if (quote?.imageKey) {
    await getStore('part-images').delete(quote.imageKey).catch(() => {})
  }

  return json({ ok: true, ref: request.ref, deleted: true })
}
