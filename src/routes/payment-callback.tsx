import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { FREIGHT_LABELS, type FreightMethod } from '@/lib/quote'

/**
 * Where Paystack returns the customer after checkout. The reference in the
 * query string is all Paystack hands over, and it is all this page passes on:
 * `verify-payment` asks Paystack what actually happened before anything is
 * marked paid, so a customer who edits this URL changes nothing.
 */
export const Route = createFileRoute('/payment-callback')({
  // Left `undefined` rather than defaulted to '' when absent: a default value
  // is one the router has to put back into the URL, which turns every arrival
  // here — including the real return from Paystack — into a 307 that rewrites
  // the customer's address bar.
  validateSearch: (search: Record<string, unknown>) => ({
    reference: typeof search.reference === 'string' ? search.reference : undefined,
    trxref: typeof search.trxref === 'string' ? search.trxref : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'GENUINE_OEM // payment_callback' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PaymentCallbackPage,
})

type VerifyResult = {
  status: string
  quote_reference?: string
  freight_method?: FreightMethod | null
  already_recorded?: boolean
  message?: string
}

const HEADLINES: Record<string, { code: string; line: string; hint: string }> = {
  paid: {
    code: '200',
    line: 'payment confirmed — this quote is now marked paid',
    hint: 'Nothing further is needed from you. We will be in touch about despatch and delivery.',
  },
  abandoned: {
    code: '402',
    line: 'payment was not completed',
    hint: 'Nothing has been charged. Your quote is still open — reopen your record to try again.',
  },
  failed: {
    code: '402',
    line: 'payment did not go through',
    hint: 'Nothing has been charged. Your quote is still open — reopen your record to try again.',
  },
  mismatch: {
    code: '409',
    line: 'payment received but it does not match this quote',
    hint: 'We have logged it and will review it by hand. Please do not pay again — we will contact you.',
  },
  not_found: {
    code: '404',
    line: 'no quote matches this transaction',
    hint: 'If you have just paid, contact us with your quote reference and we will reconcile it.',
  },
  unconfigured: {
    code: '503',
    line: 'payments are not configured on this site',
    hint: 'Contact us with your quote reference and we will take payment directly.',
  },
  invalid: {
    code: '400',
    line: 'no transaction reference was supplied',
    hint: 'Open your quote record and start the payment again.',
  },
  error: {
    code: '502',
    line: 'could not confirm the payment',
    hint: 'If you completed the payment it is safe — contact us with your quote reference and we will confirm it by hand.',
  },
}

function PaymentCallbackPage() {
  const { reference, trxref } = Route.useSearch()
  // Paystack appends both; `reference` is the documented one.
  const txnRef = reference || trxref || ''
  const [result, setResult] = useState<VerifyResult | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)

    if (!txnRef) {
      setResult({ status: 'invalid' })
      return
    }

    fetch(`${api.verifyPayment}?reference=${encodeURIComponent(txnRef)}`)
      .then(async (res) => {
        const body = (await res.json()) as VerifyResult
        if (!cancelled) setResult(body)
      })
      .catch(() => {
        if (!cancelled) setResult({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [txnRef])

  const paid = result?.status === 'paid'
  const headline = result ? (HEADLINES[result.status] ?? HEADLINES.error) : null
  const quoteRef = result?.quote_reference ?? ''

  return (
    <div className="goem-page">
      <div className="goem-terminal">
        <div className="goem-titlebar">
          <span className="goem-dot red"></span>
          <span className="goem-dot amber"></span>
          <span className="goem-dot green"></span>
          <span>genuineoem_sys — payment_callback</span>
        </div>

        <div className="goem-body">
          <p className="goem-cmd">$ ./verify_payment.sh --txn {txnRef || '(none)'}</p>
          <p className="goem-status">
            $ status:{' '}
            <span className={paid ? 'ok' : ''}>{result ? result.status : 'verifying'}</span>{' '}
            | region: UK/KE
          </p>

          <h1 className="goem-h1">PAYMENT_RECEIPT</h1>

          {!result && (
            <p className="goem-sub">
              $ confirming the transaction with the payment provider — this takes a
              moment. Do not close this window.
            </p>
          )}

          {result && headline && (
            <div className={`goem-log ${paid ? 'goem-paid-note' : 'goem-processing'}`}>
              <p>
                <span>{headline.code} &gt;</span> {headline.line}
                {paid && result.freight_method
                  ? ` (${FREIGHT_LABELS[result.freight_method]})`
                  : ''}
              </p>
              <p className="goem-hint">{headline.hint}</p>
              {/* Paystack's or our own detail, when there is one worth showing
                  beyond the headline. */}
              {result.message && result.status !== 'paid' && (
                <p className="goem-hint">$ detail: {result.message}</p>
              )}
            </div>
          )}

          {result && quoteRef && (
            <div className="goem-kv">
              <div className="goem-kv-row">
                <span className="goem-kv-key">quote_ref</span>
                <span className="goem-kv-value">
                  <code className="goem-inline-code">{quoteRef}</code>
                </span>
              </div>
            </div>
          )}

          {quoteRef ? (
            <Link
              to="/access/$ref"
              params={{ ref: quoteRef }}
              className="goem-btn goem-callback-btn"
            >
              &gt; open quote record
            </Link>
          ) : (
            result && (
              <Link to="/" className="goem-btn goem-callback-btn">
                &gt; back to terminal
              </Link>
            )
          )}

          <Link to="/" className="goem-back">
            &lt; back to terminal
          </Link>
        </div>
      </div>
    </div>
  )
}
