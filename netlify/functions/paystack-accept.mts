import process from 'node:process'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { asFreightMethod, landedCostFor } from '../lib/freight.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'
import { asQuoteState } from '../lib/quoteState.js'

/**
 * The hosted payment page used before this endpoint existed. It carries no
 * amount, so it is a fallback rather than the path: reached when the site has
 * no `PAYSTACK_SECRET_KEY`, or when Paystack declines to open a transaction
 * (its API takes NGN, KES, USD, GHS, ZAR and a handful more — a quote priced
 * in GBP cannot be initialised, and the customer should still be able to pay
 * rather than meet an error).
 */
const FALLBACK_PAYMENT_URL = 'https://paystack.shop/pay/pwcll5r9mf'

const PAYSTACK_INITIALIZE = 'https://api.paystack.co/transaction/initialize'

/** Paystack takes amounts as an integer in the currency's smallest unit. */
const subunits = (amount: string) => Math.round(Number.parseFloat(amount) * 100)

/**
 * Opens payment for one freight option on a published quote.
 *
 * The customer says only *which* option they accepted; the amount is worked out
 * here from the stored pricing, so the figure charged is the figure the admin
 * published and nothing in the browser can move it. The choice is recorded on
 * the quote before the handoff, which is what makes the order carry the
 * shipping method the customer picked even if they abandon the payment page.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  try {
    return await accept(req)
  } catch (err) {
    console.error('paystack-accept failed', err)
    return json({ error: 'accept_failed', message: 'could not open payment' }, 500)
  }
}

async function accept(req: Request) {
  let body: { ref?: unknown; method?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const ref = normalizeQuoteRef(typeof body.ref === 'string' ? body.ref : '')
  const method = asFreightMethod(body.method)
  if (!ref) return json({ error: 'not_found' }, 404)
  if (!method) {
    return json({ error: 'invalid_method', message: 'choose air or sea freight' }, 400)
  }

  const [row] = await db
    .select({ request: quoteRequests, quote: quotes })
    .from(quoteRequests)
    .innerJoin(quotes, eq(quotes.requestId, quoteRequests.id))
    .where(eq(quoteRequests.ref, ref))
    .limit(1)

  // No request, or one with no published quote: there is no price to charge,
  // and the reference is the only credential, so neither gets a hint.
  if (!row) return json({ error: 'not_found' }, 404)

  if (asQuoteState(row.quote.state) === 'paid') {
    return json({ error: 'already_paid', message: 'this quote is already marked paid' }, 409)
  }

  const amount = landedCostFor(row.quote, method)
  // Only reachable for air on a quote priced before air freight was offered —
  // the record does not draw that card, so this is the direct-POST case.
  if (amount === null) {
    return json(
      { error: 'method_unavailable', message: `${method} freight is not offered on this quote` },
      400,
    )
  }

  // A fresh reference per attempt: a customer who backs out and picks the other
  // option must not collide with the transaction they abandoned.
  const paymentRef = `${ref}-${method}-${Date.now().toString(36)}`

  await db
    .update(quotes)
    .set({ freightMethod: method, paymentRef })
    .where(eq(quotes.id, row.quote.id))

  const url = await initialize({
    req,
    ref,
    method,
    amount,
    currency: row.quote.currency,
    email: row.request.email,
    partName: row.quote.partName,
    paymentRef,
  })

  return json({ url, method, amount, currency: row.quote.currency })
}

type Initialize = {
  req: Request
  ref: string
  method: 'air' | 'sea'
  amount: string
  currency: string
  email: string
  partName: string
  paymentRef: string
}

/**
 * Asks Paystack for a checkout URL for this exact amount. Every failure path
 * ends at the hosted page rather than at an error: the customer's intent is
 * already recorded, and a quote they cannot pay is worse than one they pay on a
 * page that had to ask them for the amount.
 */
async function initialize(args: Initialize) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) {
    console.warn('paystack-accept: PAYSTACK_SECRET_KEY unset — using the hosted payment page')
    return FALLBACK_PAYMENT_URL
  }

  const origin = (() => {
    try {
      return new URL(args.req.url).origin
    } catch {
      return process.env.URL ?? ''
    }
  })()

  try {
    const res = await fetch(PAYSTACK_INITIALIZE, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: args.email,
        amount: subunits(args.amount),
        currency: args.currency,
        reference: args.paymentRef,
        callback_url: origin ? `${origin}/access/${encodeURIComponent(args.ref)}` : undefined,
        metadata: {
          quote_ref: args.ref,
          freight_method: args.method,
          part_name: args.partName,
          custom_fields: [
            {
              display_name: 'Quote reference',
              variable_name: 'quote_ref',
              value: args.ref,
            },
            {
              display_name: 'Freight method',
              variable_name: 'freight_method',
              value: args.method,
            },
          ],
        },
      }),
    })

    const payload = (await res.json().catch(() => null)) as {
      status?: boolean
      message?: string
      data?: { authorization_url?: string }
    } | null

    const url = payload?.data?.authorization_url
    if (!res.ok || !payload?.status || !url) {
      console.error(
        'paystack-accept: initialize rejected',
        res.status,
        payload?.message ?? 'no message',
      )
      return FALLBACK_PAYMENT_URL
    }

    return url
  } catch (err) {
    console.error('paystack-accept: initialize threw', err)
    return FALLBACK_PAYMENT_URL
  }
}
