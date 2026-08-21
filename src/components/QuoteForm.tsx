import { useEffect, useState } from 'react'
import { api, readError } from '@/lib/api'
import { DESTINATION_COUNTRIES } from '@/lib/countries'
import { submitNetlifyForm } from '@/lib/netlifyForms'

type Fields = {
  name: string
  email: string
  phone: string
  partNo: string
  vehicleId: string
  destinationCountry: string
  message: string
}

const initialFields: Fields = {
  name: '',
  email: '',
  phone: '',
  partNo: '',
  vehicleId: '',
  destinationCountry: 'Kenya',
  message: '',
}

type QuoteFormProps = {
  onClose: () => void
}

export function QuoteForm({ onClose }: QuoteFormProps) {
  const [fields, setFields] = useState<Fields>(initialFields)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [issuedRef, setIssuedRef] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setFields({ ...fields, [e.target.name]: e.target.value })

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(issuedRef)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context, denied permission) — the
      // reference is on screen and in the confirmation email regardless.
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      // The record is the source of truth for access_quote.sh, so it is stored
      // first and the reference comes back from the database.
      const res = await fetch(api.quoteRequest, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error(await readError(res, 'could not file the request'))
      const { ref } = (await res.json()) as { ref: string }

      // Netlify Forms is kept purely for the notification email; a failure here
      // must not lose a request that is already saved.
      await submitNetlifyForm('quote-request', {
        quote_ref: ref,
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        part_no: fields.partNo,
        vehicle_id: fields.vehicleId,
        destination_country: fields.destinationCountry,
        message: fields.message,
        subject: `Quote request ${ref} — ${fields.name}`,
      }).catch(() => {})

      setIssuedRef(ref)
      setStatus('done')
      setFields(initialFields)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'transmission failed')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="goem-modal-backdrop" onClick={onClose}>
        <div
          className="goem-modal goem-log"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="goem-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <p className="goem-label">// quote.output</p>
          <p>
            <span>200 &gt;</span> request received. supplier_network query queued —
            expect a reply within one business day.
          </p>
          <div className="goem-ref">
            <span className="goem-ref-label">quote_ref</span>
            <code className="goem-ref-value">{issuedRef}</code>
            <button type="button" className="goem-ref-copy" onClick={handleCopy}>
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
          <p>
            <span>&gt;</span> keep this reference — enter it under{' '}
            <strong>access_quote.sh</strong> to track this quote.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="goem-modal-backdrop" onClick={onClose}>
      <div
        className="goem-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="goem-modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <p className="goem-label">// run request_quote.exe</p>
        <form onSubmit={handleSubmit} className="goem-form">
          <input type="hidden" name="form-name" value="quote-request" />
          <p hidden>
            <label>
              Don't fill this out: <input name="bot-field" />
            </label>
          </p>

          <div className="goem-form-grid">
            <label className="goem-field">
              <span>name</span>
              <input
                type="text"
                name="name"
                value={fields.name}
                onChange={handleChange}
                placeholder="jane_doe"
                required
              />
            </label>
            <label className="goem-field">
              <span>email</span>
              <input
                type="email"
                name="email"
                value={fields.email}
                onChange={handleChange}
                placeholder="jane@example.com"
                required
              />
            </label>
            <label className="goem-field">
              <span>phone</span>
              <input
                type="tel"
                name="phone"
                value={fields.phone}
                onChange={handleChange}
                placeholder="+254 7xx xxx xxx"
              />
            </label>
            <label className="goem-field">
              <span>destination_country</span>
              <select
                name="destinationCountry"
                value={fields.destinationCountry}
                onChange={handleChange}
                required
              >
                {DESTINATION_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label className="goem-field goem-field-wide">
              <span>part_no</span>
              <input
                type="text"
                name="partNo"
                value={fields.partNo}
                onChange={handleChange}
                placeholder="11427566327"
              />
            </label>
            <label className="goem-field goem-field-wide">
              <span>vehicle_id</span>
              <input
                type="text"
                name="vehicleId"
                value={fields.vehicleId}
                onChange={handleChange}
                placeholder="VIN if known, e.g. Range Rover Sport L494, Range Rover Evoque L551"
              />
            </label>
            <label className="goem-field goem-field-wide">
              <span>message</span>
              <textarea
                name="message"
                value={fields.message}
                onChange={handleChange}
                placeholder="additional details"
                rows={3}
              />
            </label>
          </div>

          <button type="submit" className="goem-btn" disabled={status === 'submitting'}>
            {status === 'submitting' ? '> sending...' : '> submit quote_request'}
          </button>
          <p className="goem-hint">
            Delivery is quoted to your destination country — shipping and customs
            duties are itemised in the quote you receive.
          </p>
          {status === 'error' && (
            <p className="goem-error">$ error: {error} — please retry or contact us directly.</p>
          )}
        </form>
      </div>
    </div>
  )
}
