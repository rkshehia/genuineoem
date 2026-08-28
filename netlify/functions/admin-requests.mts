import process from 'node:process'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { adminGate } from '../lib/auth.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { quotePayload } from '../lib/quoteView.js'

/**
 * Drizzle reports a failed query by putting the whole SQL statement in the
 * message and hanging the driver's actual complaint off `cause`. The console
 * prints this on one line, so unwrap to the innermost real reason and leave
 * the SQL dump in the function log where it belongs.
 */
function rootCause(err: unknown) {
  let current: unknown = err
  let detail = ''
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const line = current.message.split('\n')[0].trim()
    if (line && !line.startsWith('Failed query:')) detail = line
    current = (current as { cause?: unknown }).cause
  }
  return detail.slice(0, 200)
}

/** Every filed request, newest first, each with its quote if one exists. */
export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const denied = adminGate(req)
  if (denied) return denied

  try {
    return await listRequests()
  } catch (err) {
    console.error('admin-requests failed', err)
    // The caller is an authenticated admin, so the actual reason is more use
    // than a generic failure: an unapplied migration reads as "column ... does
    // not exist" rather than as an empty console.
    const detail = rootCause(err)
    return json(
      {
        error: 'storage_failed',
        message: detail ? `could not load requests — ${detail}` : 'could not load requests',
      },
      500,
    )
  }
}

async function listRequests() {
  const rows = await db
    .select()
    .from(quoteRequests)
    .leftJoin(quotes, eq(quotes.requestId, quoteRequests.id))
    .orderBy(desc(quoteRequests.createdAt), desc(quoteRequests.id))

  return json({
    // Which deploy these records came from. Preview deploys get their own
    // database branch, so an enquiry filed on one URL is legitimately absent
    // from another — worth stating rather than leaving as a mystery.
    env: {
      context: process.env.CONTEXT ?? 'dev',
      branch: process.env.BRANCH ?? '',
    },
    requests: rows.map((row) => ({
      ...row.quote_requests,
      quote: row.quotes ? quotePayload(row.quotes) : null,
    })),
  })
}
