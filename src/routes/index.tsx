import { useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { QuoteForm } from '@/components/QuoteForm'
import { api } from '@/lib/api'
import { normalizeQuoteRef } from '@/lib/quoteRef'

export const Route = createFileRoute('/')({
  component: HomePage,
})

const capabilities = [
  {
    id: '01',
    title: 'source_verify',
    desc: '100% genuine OEM, zero aftermarket',
  },
  {
    id: '02',
    title: 'fleet_scope',
    desc: 'Land Rover only',
  },
  {
    id: '03',
    title: 'logistics',
    desc: 'UK dispatch, KE delivery route',
  },
  {
    id: '04',
    title: 'pricing',
    desc: 'wholesale-indexed, no markup padding',
  },
]

const processLog = [
  'submit part_no / vehicle_id / destination',
  'query supplier_network',
  'return quote.output + quote_ref',
  'open access_quote.sh with quote_ref',
  'confirm + dispatch',
]

const tabs = [
  { id: 'request', label: '[1] request_quote.exe' },
  { id: 'access', label: '[2] access_quote.sh' },
] as const

type TabId = (typeof tabs)[number]['id']

const REF_PATTERN = /^GO-[A-Z0-9]{4}-[A-Z0-9]{3}$/

function HomePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('request')
  const [quoteFormOpen, setQuoteFormOpen] = useState(false)
  const [accessRef, setAccessRef] = useState('')
  const [accessError, setAccessError] = useState('')
  const [checking, setChecking] = useState(false)
  const tablistRef = useRef<HTMLDivElement>(null)

  // The reference is checked before navigating so a mistyped code fails here,
  // on the terminal, rather than on an empty record page.
  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    const ref = normalizeQuoteRef(accessRef)
    setAccessRef(ref)
    if (!REF_PATTERN.test(ref)) {
      setAccessError('reference must look like GO-7K4M-Q9P')
      return
    }
    setChecking(true)
    setAccessError('')
    try {
      const res = await fetch(`${api.quoteLookup}?ref=${encodeURIComponent(ref)}`)
      if (res.status === 404) {
        setAccessError(`no record matches ${ref}`)
        return
      }
      if (!res.ok) throw new Error('lookup failed')
      await navigate({ to: '/access/$ref', params: { ref } })
    } catch {
      setAccessError('lookup failed — check your connection and retry')
    } finally {
      setChecking(false)
    }
  }

  const handleTabKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const current = tabs.findIndex((t) => t.id === tab)
    const step = e.key === 'ArrowRight' ? 1 : tabs.length - 1
    const next = tabs[(current + step) % tabs.length]
    setTab(next.id)
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`#goem-tab-${next.id}`)
      ?.focus()
  }

  return (
    <div className="goem-page">
      <div className="goem-terminal">
        <div className="goem-titlebar">
          <span className="goem-dot red"></span>
          <span className="goem-dot amber"></span>
          <span className="goem-dot green"></span>
          <span>genuineoem_sys — parts_db://uk.node</span>
        </div>

        <div className="goem-body">
          <p className="goem-cmd">$ system.init --client-portal</p>
          <p className="goem-status">
            $ status: <span className="ok">online</span> | region: UK/KE | catalog:
            LAND_ROVER
          </p>

          <h1 className="goem-h1">GENUINE_OEM // PARTS_ACCESS</h1>
          <p className="goem-sub">
            Direct database query for verified Genuine Land Rover OEM parts.
            Wholesale-sourced. UK based. Kenya delivery enabled.
          </p>

          <div
            className="goem-tabs"
            role="tablist"
            aria-label="parts portal actions"
            ref={tablistRef}
            onKeyDown={handleTabKeys}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`goem-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`goem-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`goem-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'request' ? (
            <div
              id="goem-panel-request"
              role="tabpanel"
              aria-labelledby="goem-tab-request"
            >
              <button
                type="button"
                className="goem-btn"
                onClick={() => setQuoteFormOpen(true)}
              >
                &gt; run request_quote.exe
              </button>
              <p className="goem-hint">
                New part enquiry — returns a quote reference you can use to track it
                later.
              </p>
            </div>
          ) : (
            <div
              id="goem-panel-access"
              role="tabpanel"
              aria-labelledby="goem-tab-access"
            >
              <form className="goem-prompt-row" onSubmit={handleAccess}>
                <div className="goem-prompt">
                  <span className="sigil">$ /access</span>
                  <input
                    type="text"
                    value={accessRef}
                    onChange={(e) => {
                      setAccessRef(e.target.value)
                      setAccessError('')
                    }}
                    placeholder="GO-XXXX-XXX"
                    aria-label="quote reference"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button type="submit" className="goem-btn" disabled={checking}>
                  {checking ? '> resolving...' : '> open'}
                </button>
              </form>
              {accessError && <p className="goem-error">$ error: {accessError}</p>}
              <p className="goem-hint">
                Your reference is shown when you file a request and repeated in the
                subject line of our quote email. Opening it shows your submitted
                details and, once we've priced it, the full landed cost.
              </p>
            </div>
          )}
        </div>

        <div className="goem-section">
          <p className="goem-label">// system.capabilities</p>
          <div className="goem-grid">
            {capabilities.map((cap) => (
              <div key={cap.id} className="goem-card">
                <p className="goem-card-title">
                  [{cap.id}] {cap.title}
                </p>
                <p className="goem-card-desc">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="goem-section goem-log">
          <p className="goem-label">// process.log</p>
          {processLog.map((step, i) => (
            <p key={step}>
              <span>{String(i + 1).padStart(2, '0')} &gt;</span> {step}
            </p>
          ))}
        </div>
      </div>

      {quoteFormOpen && <QuoteForm onClose={() => setQuoteFormOpen(false)} />}
    </div>
  )
}
