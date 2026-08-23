import { getStore } from '@netlify/blobs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { adminGate } from '../lib/auth.js'
import { sendQuoteReady } from '../lib/email.js'
import { json, methodNotAllowed } from '../lib/http.js'

// Netlify caps a synchronous function's request payload at 6MB, so the photo
// has to leave room for the rest of the multipart body.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const text = (form: FormData, key: string, max: number) => {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// Each cost lands in a numeric(12,2) column and three of them are summed into
// another, so an amount larger than this would fail in the database rather
// than in validation.
const MAX_AMOUNT = 99_999_999.99

/**
 * Tolerates `£1,250.00` and `1250` alike. Group separators are dropped, but a
 * value still carrying a second decimal point is ambiguous rather than merely
 * untidy: `1.250.00` parses as 1.25, which would publish a quote at a
 * thousandth of its price with nothing to show anything went wrong. Those are
 * rejected instead, signalled by `null`.
 */
const money = (form: FormData, key: string) => {
  const raw = text(form, key, 32).replace(/[^0-9.]/g, '')
  if (!raw) return 0
  if (!/^\d*\.?\d*$/.test(raw)) return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AMOUNT) return null
  return parsed
}

/**
 * Publishes (or re-publishes) the priced quote for a request. Writing this row
 * is what flips `access_quote.sh` from "still being processed" to the full
 * quote, so it is the single admin action that matters.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const denied = adminGate(req)
  if (denied) return denied

  try {
    return await publish(req)
  } catch (err) {
    console.error('admin-quote failed', err)
    return json({ error: 'storage_failed', message: 'could not publish the quote' }, 500)
  }
}

async function publish(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'invalid_form_data' }, 400)
  }

  const ref = text(form, 'ref', 32)
  const [request] = await db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.ref, ref))
    .limit(1)
  if (!request) return json({ error: 'unknown_request' }, 404)

  const partCost = money(form, 'partCost')
  const shippingCost = money(form, 'shippingCost')
  const dutiesCost = money(form, 'dutiesCost')

  if (partCost === null || shippingCost === null || dutiesCost === null) {
    return json(
      {
        error: 'invalid_amount',
        message: 'each cost must be a plain amount up to 99,999,999.99',
      },
      400,
    )
  }

  const values = {
    partName: text(form, 'partName', 200),
    partNo: text(form, 'partNo', 120),
    vin: text(form, 'vin', 64),
    details: text(form, 'details', 4000),
    currency: text(form, 'currency', 8) || 'GBP',
    partCost: partCost.toFixed(2),
    shippingCost: shippingCost.toFixed(2),
    dutiesCost: dutiesCost.toFixed(2),
    totalCost: (partCost + shippingCost + dutiesCost).toFixed(2),
    leadTime: text(form, 'leadTime', 120),
    notes: text(form, 'notes', 2000),
    updatedAt: new Date(),
  }

  if (!values.partName) {
    return json({ error: 'missing_fields', message: 'part name is required' }, 400)
  }

  const [existing] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.requestId, request.id))
    .limit(1)

  const store = getStore('part-images')
  const upload = form.get('image')
  const removeImage = text(form, 'removeImage', 4) === '1'

  let imageKey = existing?.imageKey ?? null
  let imageType = existing?.imageType ?? null

  if (upload instanceof File && upload.size > 0) {
    if (!upload.type.startsWith('image/')) {
      return json({ error: 'invalid_image', message: 'the part photo must be an image file' }, 400)
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return json({ error: 'image_too_large', message: 'the part photo must be under 4MB' }, 400)
    }
    const key = `${request.ref}/${Date.now()}`
    await store.set(key, await upload.arrayBuffer())
    if (imageKey && imageKey !== key) {
      // Best effort: an orphaned blob is harmless, a failed publish is not.
      await store.delete(imageKey).catch(() => {})
    }
    imageKey = key
    imageType = upload.type
  } else if (removeImage && imageKey) {
    await store.delete(imageKey).catch(() => {})
    imageKey = null
    imageType = null
  }

  const row = { ...values, imageKey, imageType }

  if (existing) {
    await db.update(quotes).set(row).where(eq(quotes.id, existing.id))
  } else {
    await db.insert(quotes).values({ ...row, requestId: request.id })
  }

  // The quote is live for the customer the moment the row lands, so telling
  // them about it comes after the write and cannot undo it: `sendQuoteReady`
  // logs and swallows its own failures, leaving the admin with a published
  // quote rather than an error on a price that did in fact save.
  await sendQuoteReady({
    req,
    ref: request.ref,
    name: request.name,
    email: request.email,
    partName: values.partName,
    currency: values.currency,
    totalCost: values.totalCost,
    leadTime: values.leadTime,
    updated: Boolean(existing),
  })

  return json({ ok: true, ref: request.ref, published: true })
}
