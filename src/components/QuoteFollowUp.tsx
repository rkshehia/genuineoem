import { useState } from 'react'
import { submitNetlifyForm } from '@/lib/netlifyForms'

type QuoteFollowUpProps = {
  quoteRef: string
  defaultEmail?: string
}

/**
 * Lets a customer reply on an open record — chase a price, change quantity,
 * confirm an order. Routed through Netlify Forms so it lands in the same inbox
 * as the original request.
 */
export function QuoteFollowUp({ quoteRef, defaultEmail = '' }: QuoteFollowUpProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    try {
      await submitNetlifyForm('quote-followup', {
        quote_ref: quoteRef,
        email,
        message,
        subject: `Quote follow-up ${quoteRef}`,
      })
      setStatus('done')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="goem-log">
        <p>
          <span>200 &gt;</span> message logged against {quoteRef} — we'll reply to{' '}
          {email} within one business day.
        </p>
        <button type="button" className="goem-link-btn" onClick={() => setStatus('idle')}>
          &gt; send another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="goem-form">
      <div className="goem-form-grid">
        <label className="goem-field goem-field-wide">
          <span>email</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="the address you filed the quote with"
            required
          />
        </label>
        <label className="goem-field goem-field-wide">
          <span>message</span>
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="what do you need on this quote?"
            rows={3}
            required
          />
        </label>
      </div>
      <button type="submit" className="goem-btn" disabled={status === 'submitting'}>
        {status === 'submitting' ? '> sending...' : '> send message'}
      </button>
      {status === 'error' && (
        <p className="goem-error">
          $ error: transmission failed — please retry or contact us directly.
        </p>
      )}
    </form>
  )
}
