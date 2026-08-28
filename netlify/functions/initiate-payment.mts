import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { siteUrl } from '../lib/email.js'
import { asFreightMethod, landedCostFor } from '../lib/freight.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { initializeTransaction, paystackSecret } from '../lib/paystack.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'
import { asQuoteState } from '../lib/quoteState.js'

/**
 * Opens a real Paystack transaction for one freight option on a published
 * quote, and hands the checkout URL back for the browser to redirect to.
 *
 * The customer sends only *which* option they accepted. The amount is
 * recalculated here from the pricing the admin published, so no figure from the
 * browser can influence what is charged — a request body carrying an `amount`
 * is ignored outright. The choice and the transaction reference are recorded
 * against the quote before the handoff, which is what lets the order carry the
 * customer's shipping method and lets the callback tie a payment back to this
 * record.
 *
 * With no `PAYSTACK_SECRET_KEY` the endpoint answers 503 rather than falling
 * back to a hosted payment page: a page that cannot carry the amount takes
 * money nobody can reconcile against a quote.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  try {
    return await initiate(req)
  } catch (err) {
    console.error('initiate-payment failed', err)
    return json({ error: 'initiate_failed', message: 'could not open payment' }, 500)
  }
}

async function initiate(req: Request) {
  const secret = paystackSecret()
  if (!secret) {
    console.warn('initiate-payment: PAYSTACK_SECRET_KEY unset — refusing to open payment')
    return json(
      {
        error: 'payments_unconfigured',
        message: 'payments are not yet configured — contact us to settle this quote',
      },
      503,
    )
  }

  let body: { quote_reference?: unknown; freight_method?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const ref = normalizeQuoteRef(
    typeof body.quote_reference === 'string' ? body.quote_reference : '',
  )
  const method = asFreightMethod(body.freight_method)
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

  // The authoritative figure: part + this option's freight + duties, from the
  // stored pricing.
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
  // option must not collide with the transaction they abandoned, and Paystack
  // requires the reference to be unique.
  const paymentRef = `${ref}-${method}-${Date.now().toString(36)}`

  // Recorded before the handoff so the accepted option survives a customer who
  // reaches the checkout page and abandons it.
  await db
    .update(quotes)
    .set({ freightMethod: method, paymentRef })
    .where(eq(quotes.id, row.quote.id))

  const result = await initializeTransaction(secret, {
    email: row.request.email,
    amount,
    currency: row.quote.currency,
    reference: paymentRef,
    callbackUrl: `${siteUrl(req)}/payment-callback`,
    metadata: {
      quote_reference: ref,
      freight_method: method,
      part_name: row.quote.partName,
      custom_fields: [
        {
          display_name: 'Quote reference',
          variable_name: 'quote_reference',
          value: ref,
        },
        {
          display_name: 'Freight method',
          variable_name: 'freight_method',
          value: method,
        },
      ],
    },
  })

  if (!result.ok) {
    // Paystack's own message, which is the useful part when it declines: an
    // unsupported currency on the quote is the likeliest cause.
    return json({ error: 'initialize_rejected', message: result.message }, 502)
  }

  return json({
    authorization_url: result.authorizationUrl,
    reference: result.reference,
    freight_method: method,
    amount,
    currency: row.quote.currency,
  })
}
