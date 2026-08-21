import { getStore } from '@netlify/blobs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'

/**
 * Serves the part photo attached to a quote. Keyed by reference rather than by
 * blob key so the URL stays stable and guessing a key gets you nowhere.
 */
export default async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  try {
    return await serveImage(req)
  } catch (err) {
    console.error('part-image failed', err)
    return new Response('Image unavailable', { status: 500 })
  }
}

async function serveImage(req: Request) {
  const ref = normalizeQuoteRef(new URL(req.url).searchParams.get('ref') ?? '')
  if (!ref) return new Response('Not found', { status: 404 })

  const [row] = await db
    .select({ imageKey: quotes.imageKey, imageType: quotes.imageType })
    .from(quotes)
    .innerJoin(quoteRequests, eq(quotes.requestId, quoteRequests.id))
    .where(eq(quoteRequests.ref, ref))
    .limit(1)

  if (!row?.imageKey) return new Response('Not found', { status: 404 })

  const blob = await getStore('part-images').get(row.imageKey, { type: 'arrayBuffer' })
  if (!blob) return new Response('Not found', { status: 404 })

  return new Response(blob, {
    headers: {
      'content-type': row.imageType || 'application/octet-stream',
      'cache-control': 'private, max-age=60',
    },
  })
}
