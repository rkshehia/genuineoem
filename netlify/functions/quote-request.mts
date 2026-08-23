import { db } from '../../db/index.js'
import { quoteRequests } from '../../db/schema.js'
import { generateQuoteRef } from '../lib/quoteRef.js'
import { sendQuoteRequestReceived } from '../lib/email.js'
import { json, methodNotAllowed } from '../lib/http.js'

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const values = {
    name: clean(payload.name, 120),
    email: clean(payload.email, 200),
    phone: clean(payload.phone, 60),
    partNo: clean(payload.partNo, 120),
    vehicleId: clean(payload.vehicleId, 200),
    destinationCountry: clean(payload.destinationCountry, 80),
    message: clean(payload.message, 4000),
  }

  if (!values.name || !values.email.includes('@')) {
    return json({ error: 'missing_fields', message: 'name and a valid email are required' }, 400)
  }
  if (!values.destinationCountry) {
    return json({ error: 'missing_fields', message: 'destination country is required' }, 400)
  }

  // References are random, so a clash is vanishingly unlikely — but the column
  // is unique, so retry rather than hand the customer a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    let ref: string
    try {
      const [row] = await db
        .insert(quoteRequests)
        .values({ ...values, ref: generateQuoteRef() })
        .returning()
      ref = row.ref
    } catch (err) {
      if (attempt === 4) {
        console.error('quote-request insert failed', err)
        return json({ error: 'storage_failed' }, 500)
      }
      continue
    }

    // Sent outside the retry above on purpose: the enquiry is already stored,
    // and a throw from in there would be read as a failed insert and write the
    // request a second time. The confirmation is a courtesy anyway — it logs
    // and swallows its own failures so a Resend outage cannot cost the
    // customer their reference.
    await sendQuoteRequestReceived({ req, ...values, ref })
    return json({ ref }, 201)
  }
  return json({ error: 'storage_failed' }, 500)
}
