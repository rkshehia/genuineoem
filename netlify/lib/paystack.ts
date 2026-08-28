import process from 'node:process'

const API = 'https://api.paystack.co'

/**
 * Paystack takes and reports amounts as an integer in the currency's smallest
 * unit — kobo, cents. Rounded rather than truncated so a stored 12.35 cannot
 * come out a penny short through float representation.
 */
export const toSubunits = (amount: string | number) => {
  const parsed = typeof amount === 'number' ? amount : Number.parseFloat(amount)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

/**
 * The secret key, or null when the site has none. Callers answer a null by
 * telling the customer payments are not configured yet: there is deliberately
 * no hosted-page fallback, because a fallback page cannot carry the amount and
 * would take a payment nobody can reconcile against a quote.
 */
export const paystackSecret = () => process.env.PAYSTACK_SECRET_KEY || null

type PaystackEnvelope<T> = {
  status?: boolean
  message?: string
  data?: T
}

/**
 * One call against the Paystack API. Network faults, non-JSON bodies and
 * `status: false` payloads all come back as a failure with Paystack's own
 * message where it gave one, so callers have something to show rather than a
 * thrown request.
 */
async function call<T>(
  path: string,
  secret: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (err) {
    console.error('paystack: request threw', path, err)
    return { ok: false, message: 'could not reach the payment provider' }
  }

  const payload = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null

  if (!res.ok || !payload?.status || !payload.data) {
    const message = payload?.message || `payment provider returned ${res.status}`
    console.error('paystack: rejected', path, res.status, message)
    return { ok: false, message }
  }

  return { ok: true, data: payload.data }
}

export type InitializeArgs = {
  email: string
  /** Major units, as stored on the quote. Converted to subunits here. */
  amount: string
  currency: string
  /** Our own reference for the attempt; Paystack requires it to be unique. */
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}

/** Opens a transaction and hands back the checkout URL to redirect to. */
export async function initializeTransaction(secret: string, args: InitializeArgs) {
  const result = await call<{ authorization_url?: string; reference?: string }>(
    '/transaction/initialize',
    secret,
    {
      method: 'POST',
      body: JSON.stringify({
        email: args.email,
        amount: toSubunits(args.amount),
        currency: args.currency,
        reference: args.reference,
        callback_url: args.callbackUrl,
        metadata: args.metadata,
      }),
    },
  )

  if (!result.ok) return result
  if (!result.data.authorization_url) {
    return { ok: false as const, message: 'payment provider returned no checkout URL' }
  }

  return {
    ok: true as const,
    authorizationUrl: result.data.authorization_url,
    reference: result.data.reference || args.reference,
  }
}

export type VerifiedTransaction = {
  /** 'success' is the only value that may settle a quote. */
  status: string
  /** Subunits, as charged. Checked against the quote before marking it paid. */
  amount: number
  currency: string
  reference: string
  paidAt: string | null
  gatewayResponse: string | null
  /**
   * What we sent as metadata when the transaction was opened, read back. Used
   * only to find the quote when its stored reference has moved on to a later
   * attempt — never to decide what the payment was worth.
   */
  quoteReference: string | null
  freightMethod: string | null
}

/** Asks Paystack what actually happened to a transaction. */
export async function verifyTransaction(secret: string, reference: string) {
  const result = await call<{
    status?: string
    amount?: number
    currency?: string
    reference?: string
    paid_at?: string | null
    gateway_response?: string | null
    metadata?: { quote_reference?: unknown; freight_method?: unknown } | null
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, secret, { method: 'GET' })

  if (!result.ok) return result

  // Paystack hands metadata back as an object on card transactions but as a
  // JSON string on some channels, so both shapes are read.
  const metadata = (() => {
    const raw = result.data.metadata
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return raw ?? null
  })()
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

  return {
    ok: true as const,
    transaction: {
      status: result.data.status || 'unknown',
      amount: typeof result.data.amount === 'number' ? result.data.amount : 0,
      currency: result.data.currency || '',
      reference: result.data.reference || reference,
      paidAt: result.data.paid_at ?? null,
      gatewayResponse: result.data.gateway_response ?? null,
      quoteReference: text(metadata?.quote_reference),
      freightMethod: text(metadata?.freight_method),
    } satisfies VerifiedTransaction,
  }
}
