import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quoteRequests, quotes } from '../../db/schema.js'
import { asFreightMethod, landedCostFor, landedCosts } from '../lib/freight.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { paystackSecret, toSubunits, verifyTransaction } from '../lib/paystack.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'
import { asQuoteState } from '../lib/quoteState.js'

/**
 * The server side of `/payment-callback`. Paystack sends the customer back with
 * a transaction reference in the query string, and that reference is the only
 * thing this endpoint trusts from the browser: everything about the payment —
 * whether it succeeded, for how much, in what currency — is read back from
 * Paystack's own `/transaction/verify` before a quote is marked paid.
 *
 * A quote is normally located by the reference we minted when the transaction
 * was opened, so a made-up reference resolves to nothing and a real one can
 * only settle the quote it belongs to.
 */
export default async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST')

  try {
    return await verify(req)
  } catch (err) {
    console.error('verify-payment failed', err)
    return json({ status: 'error', message: 'could not verify the payment' }, 500)
  }
}

/** The request and its published quote, joined, or undefined. */
async function findByPaymentRef(reference: string) {
  const [row] = await db
    .select({ request: quoteRequests, quote: quotes })
    .from(quotes)
    .innerJoin(quoteRequests, eq(quotes.requestId, quoteRequests.id))
    .where(eq(quotes.paymentRef, reference))
    .limit(1)
  return row
}

async function findByQuoteRef(ref: string) {
  const [row] = await db
    .select({ request: quoteRequests, quote: quotes })
    .from(quoteRequests)
    .innerJoin(quotes, eq(quotes.requestId, quoteRequests.id))
    .where(eq(quoteRequests.ref, ref))
    .limit(1)
  return row
}

async function verify(req: Request) {
  const secret = paystackSecret()
  if (!secret) {
    console.warn('verify-payment: PAYSTACK_SECRET_KEY unset — cannot verify')
    return json(
      { status: 'unconfigured', message: 'payments are not configured on this site' },
      503,
    )
  }

  const params = new URL(req.url).searchParams
  // Paystack appends both on the return trip; `reference` is the documented
  // one, `trxref` the legacy alias.
  const reference = (params.get('reference') || params.get('trxref') || '').trim()
  if (!reference) {
    return json({ status: 'invalid', message: 'no transaction reference given' }, 400)
  }

  const byPaymentRef = await findByPaymentRef(reference)

  // Already settled — an admin marking it paid, or the customer reloading the
  // callback. Nothing to re-check, and no call to Paystack needed.
  if (byPaymentRef && asQuoteState(byPaymentRef.quote.state) === 'paid') {
    return json({
      status: 'paid',
      quote_reference: byPaymentRef.request.ref,
      freight_method: asFreightMethod(byPaymentRef.quote.freightMethod),
      already_recorded: true,
    })
  }

  const result = await verifyTransaction(secret, reference)
  if (!result.ok) {
    return json(
      {
        status: 'error',
        quote_reference: byPaymentRef?.request.ref,
        message: result.message,
      },
      502,
    )
  }
  const txn = result.transaction

  // The quote no longer holds this reference: the customer opened a second
  // attempt (the other freight option, say) and then completed the first. The
  // metadata we sent when opening it says which quote it was for, so the
  // payment reconciles instead of being orphaned. It only identifies the quote
  // — the amount is still checked against the stored pricing below.
  const row =
    byPaymentRef ??
    (txn.quoteReference ? await findByQuoteRef(normalizeQuoteRef(txn.quoteReference)) : undefined)

  if (!row) {
    console.warn('verify-payment: no quote holds reference', reference)
    return json({ status: 'not_found', message: 'no quote matches this transaction' }, 404)
  }

  const quoteRef = row.request.ref

  if (asQuoteState(row.quote.state) === 'paid') {
    return json({
      status: 'paid',
      quote_reference: quoteRef,
      freight_method: asFreightMethod(row.quote.freightMethod),
      already_recorded: true,
    })
  }

  if (txn.status !== 'success') {
    // 'abandoned' or 'failed': the quote stays issued so the customer can try
    // again from their record.
    return json({
      status: txn.status === 'abandoned' ? 'abandoned' : 'failed',
      quote_reference: quoteRef,
      message: txn.gatewayResponse || `payment was not completed (${txn.status})`,
    })
  }

  // Paystack says it succeeded; check it succeeded for what we asked. The
  // expected figure is recalculated from the stored pricing, never read out of
  // the transaction, so an amount that does not match the published quote
  // cannot settle it.
  const method = asFreightMethod(row.quote.freightMethod) ?? asFreightMethod(txn.freightMethod)
  const expected = method
    ? [landedCostFor(row.quote, method)]
    : // No method on the record or in the metadata: an older row, or one hand
      // edited. Accept either published landed cost rather than refusing a
      // genuine payment.
      Object.values(landedCosts(row.quote))
  const expectedSubunits = expected
    .filter((value): value is string => value !== null)
    .map(toSubunits)

  const enough =
    expectedSubunits.length > 0 && expectedSubunits.some((value) => txn.amount >= value)
  const currencyMatches =
    !txn.currency || txn.currency.toUpperCase() === row.quote.currency.toUpperCase()

  if (!enough || !currencyMatches) {
    console.error(
      'verify-payment: amount or currency mismatch',
      reference,
      `paid ${txn.amount} ${txn.currency}`,
      `expected >= ${expectedSubunits.join(' or ')} ${row.quote.currency}`,
    )
    return json({
      status: 'mismatch',
      quote_reference: quoteRef,
      message: 'the payment did not match this quote — we will review it and be in touch',
    })
  }

  // `updatedAt` is left alone: the record page shows it as the date the quote
  // was issued, and a payment does not re-issue the quote.
  await db.update(quotes).set({ state: 'paid' }).where(eq(quotes.id, row.quote.id))

  console.log('verify-payment: quote marked paid', quoteRef, reference)

  return json({
    status: 'paid',
    quote_reference: quoteRef,
    freight_method: method,
    already_recorded: false,
  })
}
