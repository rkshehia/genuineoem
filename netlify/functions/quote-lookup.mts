import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'
import { quotePayload } from '../lib/quoteView.js'
import { json, methodNotAllowed } from '../lib/http.js'

/**
 * Public record lookup for `access_quote.sh`. The reference is the only
 * credential, so an unknown one gets a flat 404 with no hints.
 */
export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  try {
    return await lookup(req)
  } catch (err) {
    console.error('quote-lookup failed', err)
    return json({ status: 'error', message: 'lookup failed' }, 500)
  }
}

async function lookup(req: Request) {
  const ref = normalizeQuoteRef(new URL(req.url).searchParams.get('ref') ?? '')
  if (!ref) return json({ status: 'not_found' }, 404)

  const [request] = await db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.ref, ref))
    .limit(1)

  if (!request) return json({ status: 'not_found' }, 404)

  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.requestId, request.id))
    .limit(1)

  const requestPayload = {
    ref: request.ref,
    name: request.name,
    email: request.email,
    phone: request.phone,
    partNo: request.partNo,
    vehicleId: request.vehicleId,
    destinationCountry: request.destinationCountry,
    message: request.message,
    createdAt: request.createdAt,
  }

  // No quote row means no admin has priced this yet.
  if (!quote) return json({ status: 'processing', request: requestPayload })

  return json({
    status: 'ready',
    request: requestPayload,
    quote: quotePayload(quote),
  })
}
