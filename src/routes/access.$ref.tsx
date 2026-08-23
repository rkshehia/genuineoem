import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { api, partImageUrl } from '@/lib/api'
import { formatDate, formatMoney, type LookupResult } from '@/lib/quote'
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
  const navigate = useNavigate()
  const [handingOff, setHandingOff] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // The payment link opens in its own tab, so this record page is left behind
  // on the customer's screen. Once the handoff has happened there is nothing
  // more to do here — send it back to the terminal instead of leaving a stale
  // quote sitting open.
  function handleAccept() {
    if (handingOff) return
    setHandingOff(true)
    timer.current = setTimeout(() => {
      navigate({ to: '/' })
    }, 1200)
  }

  return (
    <>
      <div className="goem-kv">
        <Row label="part" value={quote.partName} />
        <Row label="part_no" value={quote.partNo} />
        <Row label="vin" value={quote.vin} />
        <Row label="lead_time" value={quote.leadTime} />
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
        <div className="goem-cost-row">
          <span>shipping</span>
          <span>{formatMoney(quote.shippingCost, quote.currency)}</span>
        </div>
        <div className="goem-cost-row">
          <span>customs_duties</span>
          <span>{formatMoney(quote.dutiesCost, quote.currency)}</span>
        </div>
        <div className="goem-cost-row goem-cost-total">
          <span>total_landed_cost</span>
          <span>{formatMoney(quote.totalCost, quote.currency)}</span>
        </div>
      </div>

      {/* Once the quote is settled the payment link is gone entirely, rather
          than disabled: there is nothing left here for the customer to pay. */}
      {quote.state === 'paid' ? (
        <div className="goem-log goem-paid-note">
          <p>
            <span>200 &gt;</span> payment received — this quote is marked paid
          </p>
          <p className="goem-hint">
            Nothing further is needed from you. We will be in touch about
            despatch and delivery.
          </p>
        </div>
      ) : (
        <>
          <a
            className="goem-accept-btn"
            href="https://paystack.shop/pay/pwcll5r9mf"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleAccept}
            aria-disabled={handingOff}
          >
            &gt; {handingOff ? 'payment window opened' : 'accept & pay'}
          </a>

          {handingOff && (
            <p className="goem-handoff">
              $ payment opened in a new tab — closing this record and returning to the
              terminal...
            </p>
          )}
        </>
      )}
    </>
  )
}
