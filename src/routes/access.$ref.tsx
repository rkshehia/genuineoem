import { useEffect, useState } from 'react'
import { Link, createFileRoute, useParams } from '@tanstack/react-router'
import { api, partImageUrl, readError } from '@/lib/api'
import {
  FREIGHT_LABELS,
  FREIGHT_LEAD_TIMES,
  FREIGHT_METHODS,
  formatDate,
  formatMoney,
  type FreightMethod,
  type LookupResult,
} from '@/lib/quote'
import { normalizeQuoteRef } from '@/lib/quoteRef'

export const Route = createFileRoute('/access/$ref')({
  head: () => ({
    meta: [
      { title: 'GENUINE_OEM // access_quote.sh' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AccessQuotePage,
})

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="goem-kv-row">
      <span className="goem-kv-key">{label}</span>
      <span className="goem-kv-value">{value || '—'}</span>
    </div>
  )
}

function AccessQuotePage() {
  const { ref: rawRef } = useParams({ from: '/access/$ref' })
  const quoteRef = normalizeQuoteRef(rawRef)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setFailed(false)
    fetch(`${api.quoteLookup}?ref=${encodeURIComponent(quoteRef)}`)
      .then(async (res) => {
        const body = (await res.json()) as LookupResult
        if (cancelled) return
        // A failed lookup still answers with JSON, but with no record
        // attached. Anything outside the states this page knows how to draw
        // belongs on the failure path — drawing it would reach for a request
        // that isn't there and blank the page.
        if (
          body.status !== 'ready' &&
          body.status !== 'processing' &&
          body.status !== 'not_found'
        ) {
          setFailed(true)
          return
        }
        setResult(body)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [quoteRef])

  const status = failed
    ? 'lookup_failed'
    : result?.status === 'ready'
      ? 'quote_ready'
      : result?.status === 'processing'
        ? 'processing'
        : result?.status === 'not_found'
          ? 'no_record'
          : 'resolving'

  // Narrowed to the states that actually carry a record, so the markup below
  // cannot be rendered against a response without one.
  const record =
    result && (result.status === 'ready' || result.status === 'processing') ? result : null

  // An admin marking the quote paid is what settles the record: the payment
  // link comes off it, so there is nothing left for the customer to trigger.
  const paid = record?.status === 'ready' && record.quote.state === 'paid'

  return (
    <div className="goem-page">
      <div className="goem-terminal">
        <div className="goem-titlebar">
          <span className="goem-dot red"></span>
          <span className="goem-dot amber"></span>
          <span className="goem-dot green"></span>
          <span>genuineoem_sys — quote_access://{quoteRef}</span>
        </div>

        <div className="goem-body">
          <p className="goem-cmd">$ ./access_quote.sh --ref {quoteRef}</p>
          <p className="goem-status">
            $ status:{' '}
            <span className={status === 'quote_ready' ? 'ok' : ''}>{status}</span> |
            region: UK/KE
          </p>

          <h1 className="goem-h1">QUOTE_RECORD // {quoteRef}</h1>

          {!result && !failed && <p className="goem-sub">$ resolving record...</p>}

          {failed && (
            <p className="goem-error">
              $ error: lookup failed — check your connection and reload.
            </p>
          )}

          {result?.status === 'not_found' && (
            <>
              <p className="goem-sub">
                $ no record matches this reference. Check the code from your
                confirmation screen or email, or file a new request.
              </p>
              <Link to="/" className="goem-btn">
                &gt; back to terminal
              </Link>
            </>
          )}

          {record && (
            <p className="goem-sub">
              Live record for this reference. Keep the code private — it is the only
              key to this quote.
            </p>
          )}

          <Link to="/" className="goem-back">
            &lt; back to terminal
          </Link>
        </div>

        {record && (
          <>
            <div className="goem-split">
              <div className="goem-section">
                <p className="goem-label">// reference.details</p>
                <div className="goem-kv">
                  <Row label="quote_ref" value={<code className="goem-inline-code">{record.request.ref}</code>} />
                  <Row label="filed" value={formatDate(record.request.createdAt)} />
                  <Row
                    label="state"
                    value={
                      <span
                        className={`goem-badge ${
                          paid ? 'paid' : record.status === 'ready' ? 'ready' : 'pending'
                        }`}
                      >
                        {paid
                          ? 'paid'
                          : record.status === 'ready'
                            ? 'quote issued'
                            : 'processing'}
                      </span>
                    }
                  />
                </div>
              </div>

              <div className="goem-section">
                <p className="goem-label">// customer.details</p>
                <div className="goem-kv">
                  <Row label="name" value={record.request.name} />
                  <Row label="email" value={record.request.email} />
                  <Row label="phone" value={record.request.phone} />
                  <Row label="destination_country" value={record.request.destinationCountry} />
                </div>
              </div>
            </div>

            <div className="goem-section">
              <p className="goem-label">// request.payload</p>
              <div className="goem-kv">
                <Row label="part_no" value={record.request.partNo} />
                <Row label="vehicle_id" value={record.request.vehicleId} />
                <Row label="message" value={record.request.message} />
              </div>
            </div>

            <div className="goem-section">
              <p className="goem-label">// quote.output</p>
              {record.status === 'processing' ? (
                <div className="goem-log goem-processing">
                  <p>
                    <span>202 &gt;</span> order is still being processed
                  </p>
                  <p className="goem-hint">
                    Your request is with our supplier network. This page updates the
                    moment the priced quote is published — reload it later to check.
                  </p>
                </div>
              ) : (
                <QuoteDetails
                  quoteRef={record.request.ref}
                  quote={record.quote}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function QuoteDetails({
  quoteRef,
  quote,
}: {
  quoteRef: string
  quote: Extract<LookupResult, { status: 'ready' }>['quote']
}) {
  // Which option is being handed off, so only the button that was pressed
  // reports itself as busy.
  const [handingOff, setHandingOff] = useState<FreightMethod | null>(null)
  const [error, setError] = useState('')

  // Air is dropped entirely when the quote carries no air figure — a quote
  // priced before air freight was offered shows the sea option alone, at full
  // width, rather than a card reading nothing.
  const options = FREIGHT_METHODS.map((method) => ({
    method,
    landedCost: method === 'air' ? quote.landedCostAir : quote.landedCostSea,
  })).filter((option): option is { method: FreightMethod; landedCost: string } =>
    option.landedCost !== null,
  )

  /**
   * The browser sends only which option was accepted. The amount is
   * recalculated server-side from the published price, which also opens the
   * Paystack transaction and records the choice and its reference against the
   * order before handing over.
   */
  async function handleAccept(method: FreightMethod) {
    if (handingOff) return
    setHandingOff(method)
    setError('')
    try {
      const res = await fetch(api.initiatePayment, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_reference: quoteRef, freight_method: method }),
      })
      if (!res.ok) {
        // A site with no Paystack key answers 503: that is a configuration gap
        // rather than something the customer can retry their way out of, so it
        // gets its own wording.
        const body = (await res.clone().json().catch(() => null)) as { error?: string } | null
        setError(
          body?.error === 'payments_unconfigured'
            ? 'payments not yet configured — contact us and we will take payment directly'
            : await readError(res, 'could not open payment'),
        )
        setHandingOff(null)
        return
      }
      const body = (await res.json()) as { authorization_url?: string }
      if (!body.authorization_url) {
        setError('could not open payment — try again in a moment')
        setHandingOff(null)
        return
      }
      // Payment runs in this tab: the transaction sends the customer to
      // /payment-callback when it settles, which verifies it and points them
      // back at this record.
      window.location.assign(body.authorization_url)
    } catch {
      setError('could not reach the payment service — check your connection')
      setHandingOff(null)
    }
  }

  return (
    <>
      <div className="goem-kv">
        <Row label="part" value={quote.partName} />
        <Row label="part_no" value={quote.partNo} />
        <Row label="vin" value={quote.vin} />
        <Row label="details" value={quote.details} />
        <Row label="notes" value={quote.notes} />
        <Row label="issued" value={formatDate(quote.updatedAt)} />
      </div>

      {quote.hasImage && (
        <figure className="goem-part-image">
          <img src={partImageUrl(quoteRef, quote.updatedAt)} alt={`${quote.partName} part photo`} />
          <figcaption>part_image.jpg — supplied by GENUINE_OEM</figcaption>
        </figure>
      )}

      <div className="goem-costs">
        <div className="goem-cost-row">
          <span>part_cost</span>
          <span>{formatMoney(quote.partCost, quote.currency)}</span>
        </div>
        {quote.airFreightCost !== null && (
          <div className="goem-cost-row">
            <span>air_freight</span>
            <span>{formatMoney(quote.airFreightCost, quote.currency)}</span>
          </div>
        )}
        <div className="goem-cost-row">
          <span>sea_freight</span>
          <span>{formatMoney(quote.seaFreightCost, quote.currency)}</span>
        </div>
        <div className="goem-cost-row">
          <span>customs_duties</span>
          <span>{formatMoney(quote.dutiesCost, quote.currency)}</span>
        </div>
      </div>

      {/* Once the quote is settled the payment options are gone entirely,
          rather than disabled: there is nothing left here to pay. */}
      {quote.state === 'paid' ? (
        <div className="goem-log goem-paid-note">
          <p>
            <span>200 &gt;</span> payment received — this quote is marked paid
            {quote.freightMethod ? ` (${FREIGHT_LABELS[quote.freightMethod]})` : ''}
          </p>
          <p className="goem-hint">
            Nothing further is needed from you. We will be in touch about
            despatch and delivery.
          </p>
        </div>
      ) : (
        <>
          <p className="goem-label goem-freight-intro">
            // shipping_options — pick one to pay
          </p>
          <div className={`goem-freight-grid${options.length === 1 ? ' single' : ''}`}>
            {options.map(({ method, landedCost }) => (
              <section className="goem-freight-card" key={method}>
                <h2 className="goem-freight-head">{FREIGHT_LABELS[method]}</h2>
                <p className="goem-freight-key">$ landed_cost</p>
                <p className="goem-freight-value">
                  {formatMoney(landedCost, quote.currency)}
                </p>
                <p className="goem-freight-key">$ lead_time</p>
                <p className="goem-freight-value lead">{FREIGHT_LEAD_TIMES[method]}</p>
                <button
                  type="button"
                  className="goem-accept-btn"
                  onClick={() => handleAccept(method)}
                  disabled={handingOff !== null}
                >
                  &gt; {handingOff === method ? 'opening payment...' : 'accept & pay'}
                </button>
              </section>
            ))}
          </div>

          <p className="goem-hint goem-freight-note">
            Each landed cost is everything in — part, that option&apos;s freight and
            customs duties. Payment opens in this window.
          </p>
          {error && <p className="goem-error">$ error: {error}</p>}
        </>
      )}
    </>
  )
}
