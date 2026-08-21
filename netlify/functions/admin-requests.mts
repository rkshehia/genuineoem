import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { adminGate } from '../lib/auth.js'
import { json, methodNotAllowed } from '../lib/http.js'

/** Every filed request, newest first, each with its quote if one exists. */
export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const denied = adminGate(req)
  if (denied) return denied

  try {
    return await listRequests()
  } catch (err) {
    console.error('admin-requests failed', err)
    return json({ error: 'storage_failed', message: 'could not load requests' }, 500)
  }
}

async function listRequests() {
  const rows = await db
    .select()
    .from(quoteRequests)
    .leftJoin(quotes, eq(quotes.requestId, quoteRequests.id))
    .orderBy(desc(quoteRequests.createdAt), desc(quoteRequests.id))

  return json({
    requests: rows.map((row) => {
      const quote = row.quotes
      return {
        ...row.quote_requests,
        quote: quote
          ? {
              partName: quote.partName,
              partNo: quote.partNo,
              vin: quote.vin,
              details: quote.details,
              currency: quote.currency,
              partCost: quote.partCost,
              shippingCost: quote.shippingCost,
              dutiesCost: quote.dutiesCost,
              totalCost: quote.totalCost,
              leadTime: quote.leadTime,
              notes: quote.notes,
              hasImage: Boolean(quote.imageKey),
              updatedAt: quote.updatedAt,
            }
          : null,
      }
    }),
  })
}
