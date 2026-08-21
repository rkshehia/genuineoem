import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api, partImageUrl, readError } from '@/lib/api'
import {
  CURRENCIES,
  formatDate,
  formatMoney,
  type FormSubmission,
  type QuoteRecord,
  type QuoteRequestRecord,
} from '@/lib/quote'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'GENUINE_OEM // admin_console' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminPage,
})

type AdminRequest = QuoteRequestRecord & {
  id: number
  quote: QuoteRecord | null
}

type QuoteDraft = {
  partName: string
  partNo: string
  vin: string
  details: string
  currency: string
  partCost: string
  shippingCost: string
  dutiesCost: string
  leadTime: string
  notes: string
}

const draftFrom = (request: AdminRequest): QuoteDraft => ({
  partName: request.quote?.partName ?? '',
  partNo: request.quote?.partNo || request.partNo,
  vin: request.quote?.vin || request.vehicleId,
  details: request.quote?.details ?? '',
  currency: request.quote?.currency ?? 'GBP',
  partCost: request.quote?.partCost ?? '',
  shippingCost: request.quote?.shippingCost ?? '',
  dutiesCost: request.quote?.dutiesCost ?? '',
  leadTime: request.quote?.leadTime ?? '',
  notes: request.quote?.notes ?? '',
})

/**
 * The rest of the filed enquiry — everything the collapsed summary row does not
 * already carry, in the order the form asks for it.
 */
const ENQUIRY_FIELDS: [string, (request: AdminRequest) => string][] = [
  ['destination', (r) => r.destinationCountry],
  ['part_no', (r) => r.partNo],
  ['vehicle_id', (r) => r.vehicleId],
  ['message', (r) => r.message],
]

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

// Mirrors the parser in netlify/functions/admin-quote.mts so the running total
// shown here matches what actually gets published. An amount with a second
// decimal point counts as zero rather than being half-parsed, which makes the
// preview visibly wrong before the server rejects the publish outright.
const toNumber = (value: string) => {
  const raw = value.replace(/[^0-9.]/g, '')
  if (!/^\d*\.?\d*$/.test(raw)) return 0
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function AdminPage() {
  const [gate, setGate] = useState<'checking' | 'unconfigured' | 'locked' | 'open'>(
    'checking',
  )
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [requests, setRequests] = useState<AdminRequest[]>([])
  const [listError, setListError] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'quoted'>('all')
  const [selected, setSelected] = useState<string>('')
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  // Forms are read through the Netlify API, which needs a token the site may
  // not have. That is a normal state, not a failure, so it gets its own value.
  const [formsState, setFormsState] = useState<'loading' | 'ready' | 'unconfigured' | 'error'>(
    'loading',
  )
  const [formsMessage, setFormsMessage] = useState('')
  const [inboxOpen, setInboxOpen] = useState(false)

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch(api.adminSubmissions)
      if (!res.ok) {
        setSubmissions([])
        setFormsState('error')
        setFormsMessage(await readError(res, 'could not load form submissions'))
        return
      }
      const body = (await res.json()) as {
        configured: boolean
        submissions: FormSubmission[]
        message?: string
      }
      setSubmissions(body.submissions ?? [])
      setFormsState(body.configured ? 'ready' : 'unconfigured')
      setFormsMessage(body.message ?? '')
    } catch {
      setSubmissions([])
      setFormsState('error')
      setFormsMessage('could not reach the form submissions endpoint')
    }
  }, [])

  const loadRequests = useCallback(async () => {
    const res = await fetch(api.adminRequests)
    if (res.status === 401) {
      setGate('locked')
      return
    }
    if (res.status === 503) {
      setGate('unconfigured')
      return
    }
    if (!res.ok) {
      setListError(await readError(res, 'could not load requests'))
      return
    }
    const body = (await res.json()) as { requests: AdminRequest[] }
    setRequests(body.requests)
    setListError('')
    setGate('open')
    // The inbox is a side panel: a token problem there must not stop the
    // quote desk from rendering, so it is loaded after and never awaited into
    // the gate decision.
    void loadSubmissions()
  }, [loadSubmissions])

  useEffect(() => {
    fetch(api.adminSession)
      .then((res) => res.json() as Promise<{ configured: boolean; authenticated: boolean }>)
      .then((body) => {
        if (!body.configured) return setGate('unconfigured')
        if (!body.authenticated) return setGate('locked')
        return loadRequests()
      })
      .catch(() => setGate('locked'))
  }, [loadRequests])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    const res = await fetch(api.adminSession, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      setLoginError(await readError(res, 'access denied'))
      return
    }
    setPassword('')
    await loadRequests()
  }

  const handleLogout = async () => {
    await fetch(api.adminSession, { method: 'DELETE' })
    setRequests([])
    setSubmissions([])
    setGate('locked')
  }

  const visible = requests.filter((request) =>
    filter === 'all'
      ? true
      : filter === 'pending'
        ? !request.quote
        : Boolean(request.quote),
  )
  const pendingCount = requests.filter((request) => !request.quote).length

  // Follow-up replies are the ones worth surfacing on the card — the original
  // enquiry is already in the database and shown above them.
  const messagesByRef = useMemo(() => {
    const map = new Map<string, FormSubmission[]>()
    for (const submission of submissions) {
      if (!submission.ref || submission.formName === 'quote-request') continue
      const bucket = map.get(submission.ref)
      if (bucket) bucket.push(submission)
      else map.set(submission.ref, [submission])
    }
    return map
  }, [submissions])

  return (
    <div className="goem-page">
      <div className="goem-terminal goem-terminal-wide">
        <div className="goem-titlebar">
          <span className="goem-dot red"></span>
          <span className="goem-dot amber"></span>
          <span className="goem-dot green"></span>
          <span>genuineoem_sys — admin://quote_desk</span>
        </div>

        <div className="goem-body">
          <p className="goem-cmd">$ sudo ./admin_console --quotes</p>
          <h1 className="goem-h1">ADMIN // QUOTE_DESK</h1>

          {gate === 'checking' && <p className="goem-sub">$ authenticating...</p>}

          {gate === 'unconfigured' && (
            <p className="goem-sub">
              $ admin console disabled — set the <code className="goem-inline-code">ADMIN_PASSWORD</code>{' '}
              environment variable on this site (Site configuration → Environment
              variables) and redeploy to unlock it.
            </p>
          )}

          {gate === 'locked' && (
            <form onSubmit={handleLogin} className="goem-form goem-login">
              <p className="goem-sub">$ authentication required</p>
              <label className="goem-field">
                <span>password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button type="submit" className="goem-btn">
                &gt; unlock
              </button>
              {loginError && <p className="goem-error">$ error: {loginError}</p>}
            </form>
          )}

          {gate === 'open' && (
            <>
              <p className="goem-status">
                $ records: {requests.length} | awaiting_quote:{' '}
                <span className={pendingCount ? '' : 'ok'}>{pendingCount}</span>
              </p>
              <div className="goem-toolbar">
                {(['all', 'pending', 'quoted'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`goem-tab${filter === option ? ' active' : ''}`}
                    onClick={() => setFilter(option)}
                  >
                    [{option}]
                  </button>
                ))}
                <button type="button" className="goem-link-btn" onClick={loadRequests}>
                  &gt; refresh
                </button>
                <button type="button" className="goem-link-btn" onClick={handleLogout}>
                  &gt; lock
                </button>
              </div>
              {listError && <p className="goem-error">$ error: {listError}</p>}
            </>
          )}

          <Link to="/" className="goem-back">
            &lt; back to terminal
          </Link>
        </div>

        {gate === 'open' && (
          <div className="goem-section">
            <p className="goem-label">// quote_requests ({visible.length})</p>
            {visible.length === 0 && <p className="goem-hint">$ no records in this view.</p>}
            <div className="goem-req-list">
              {visible.map((request) => (
                <RequestCard
                  key={request.ref}
                  request={request}
                  messages={messagesByRef.get(request.ref) ?? []}
                  expanded={selected === request.ref}
                  onToggle={() =>
                    setSelected(selected === request.ref ? '' : request.ref)
                  }
                  onSaved={loadRequests}
                  onDeleted={async () => {
                    setSelected('')
                    await loadRequests()
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {gate === 'open' && (
          <div className="goem-section">
            <div className="goem-inbox-head">
              <p className="goem-label">
                // netlify_forms inbox{formsState === 'ready' ? ` (${submissions.length})` : ''}
              </p>
              {formsState === 'ready' && submissions.length > 0 && (
                <button
                  type="button"
                  className="goem-link-btn"
                  onClick={() => setInboxOpen(!inboxOpen)}
                >
                  &gt; {inboxOpen ? 'hide' : 'show'} raw submissions
                </button>
              )}
            </div>

            {formsState === 'loading' && <p className="goem-hint">$ reading submissions...</p>}

            {formsState === 'unconfigured' && (
              <p className="goem-hint">
                $ inbox locked — set{' '}
                <code className="goem-inline-code">NETLIFY_API_TOKEN</code> on this site
                (Site configuration → Environment variables) to a Netlify personal access
                token and redeploy. Everything else on this page works without it.
              </p>
            )}

            {formsState === 'error' && <p className="goem-error">$ error: {formsMessage}</p>}

            {formsState === 'ready' && submissions.length === 0 && (
              <p className="goem-hint">$ no form submissions recorded yet.</p>
            )}

            {formsState === 'ready' && inboxOpen && (
              <div className="goem-msg-list">
                {submissions.map((submission) => (
                  <SubmissionCard key={submission.id} submission={submission} showForm />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** One Netlify Forms submission, rendered as a read-only field list. */
function SubmissionCard({
  submission,
  showForm = false,
}: {
  submission: FormSubmission
  showForm?: boolean
}) {
  return (
    <div className="goem-msg">
      <div className="goem-msg-head">
        {showForm && <span className="goem-msg-form">{submission.formName}</span>}
        <span className="goem-msg-from">{submission.email || submission.name || 'anonymous'}</span>
        {submission.ref && <span className="goem-msg-ref">{submission.ref}</span>}
        <span className="goem-msg-date">{formatDate(submission.createdAt)}</span>
      </div>
      <div className="goem-kv">
        {submission.fields.length === 0 && (
          <div className="goem-kv-row">
            <span className="goem-kv-key">body</span>
            <span className="goem-kv-value">—</span>
          </div>
        )}
        {submission.fields.map((field) => (
          <div className="goem-kv-row" key={field.key}>
            <span className="goem-kv-key">{field.key}</span>
            <span className="goem-kv-value">{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RequestCard({
  request,
  messages,
  expanded,
  onToggle,
  onSaved,
  onDeleted,
}: {
  request: AdminRequest
  messages: FormSubmission[]
  expanded: boolean
  onToggle: () => void
  onSaved: () => Promise<void>
  onDeleted: () => Promise<void>
}) {
  // Every refresh rebuilds these request objects, so re-syncing the draft on
  // object identity would throw away edits the admin had typed but not yet
  // published. Compare the server's own values instead: a refresh that returns
  // the same data leaves the draft alone, and only a genuine change upstream
  // (our own publish, or another admin's) pulls the form back in line.
  const serverDraft = draftFrom(request)
  const serverSnapshot = JSON.stringify(serverDraft)

  const [draft, setDraft] = useState<QuoteDraft>(serverDraft)
  const [syncedSnapshot, setSyncedSnapshot] = useState(serverSnapshot)
  const [image, setImage] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (serverSnapshot !== syncedSnapshot) {
    setSyncedSnapshot(serverSnapshot)
    setDraft(serverDraft)
    setRemoveImage(false)
  }

  const total =
    toNumber(draft.partCost) + toNumber(draft.shippingCost) + toNumber(draft.dutiesCost)

  const set = (key: keyof QuoteDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setDraft((current) => ({ ...current, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('saving')
    setError('')
    const body = new FormData()
    body.set('ref', request.ref)
    for (const [key, value] of Object.entries(draft)) body.set(key, value)
    if (image) body.set('image', image)
    if (removeImage) body.set('removeImage', '1')

    const res = await fetch(api.adminQuote, { method: 'POST', body })
    if (!res.ok) {
      setError(await readError(res, 'could not publish the quote'))
      setStatus('error')
      return
    }
    setImage(null)
    setRemoveImage(false)
    setStatus('saved')
    await onSaved()
  }

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`${api.adminRequest}?ref=${encodeURIComponent(request.ref)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      setDeleteError(await readError(res, 'could not delete the request'))
      setConfirmingDelete(false)
      setDeleting(false)
      return
    }
    // The refresh drops this card from the list, so there is nothing left to
    // reset on success.
    await onDeleted()
  }

  return (
    <div className={`goem-req-card${expanded ? ' expanded' : ''}`}>
      <button type="button" className="goem-req-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="goem-req-ref">{request.ref}</span>
        <span className="goem-req-name">{request.name}</span>
        <span className="goem-req-meta">{request.email}</span>
        <span className="goem-req-meta">{request.phone || 'no phone'}</span>
        <span className="goem-req-meta">{formatDate(request.createdAt)}</span>
        <span className={`goem-badge ${request.quote ? 'ready' : 'pending'}`}>
          {request.quote
            ? formatMoney(request.quote.totalCost, request.quote.currency)
            : 'awaiting quote'}
        </span>
        <span className="goem-req-caret" aria-hidden="true">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {/* Everything below the summary row stays folded away until the row is
          opened, so a long list of enquiries reads as one line each. */}
      {expanded && (
        <div className="goem-req-body">
          <p className="goem-label goem-label-first">// filed_enquiry</p>
          <div className="goem-kv">
            {ENQUIRY_FIELDS.map(([key, value]) => (
              <div className="goem-kv-row" key={key}>
                <span className="goem-kv-key">{key}</span>
                <span className="goem-kv-value">{value(request) || '—'}</span>
              </div>
            ))}
          </div>

          {messages.length > 0 && (
            <>
              <p className="goem-label">// customer_messages ({messages.length})</p>
              <div className="goem-msg-list">
                {messages.map((message) => (
                  <SubmissionCard key={message.id} submission={message} />
                ))}
              </div>
            </>
          )}

          <p className="goem-label">// prepare_quote.sh</p>
          <form onSubmit={handleSubmit} className="goem-form">
            <div className="goem-form-grid">
              <label className="goem-field">
                <span>part_name *</span>
                <input value={draft.partName} onChange={set('partName')} required />
              </label>
              <label className="goem-field">
                <span>part_no</span>
                <input value={draft.partNo} onChange={set('partNo')} />
              </label>
              <label className="goem-field">
                <span>vin</span>
                <input value={draft.vin} onChange={set('vin')} />
              </label>
              <label className="goem-field">
                <span>lead_time</span>
                <input
                  value={draft.leadTime}
                  onChange={set('leadTime')}
                  placeholder="7–10 working days"
                />
              </label>
              <label className="goem-field goem-field-wide">
                <span>details</span>
                <textarea value={draft.details} onChange={set('details')} rows={3} />
              </label>

              <label className="goem-field">
                <span>currency</span>
                <select value={draft.currency} onChange={set('currency')}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="goem-field">
                <span>part_cost</span>
                <input
                  inputMode="decimal"
                  value={draft.partCost}
                  onChange={set('partCost')}
                  placeholder="0.00"
                />
              </label>
              <label className="goem-field">
                <span>shipping_cost</span>
                <input
                  inputMode="decimal"
                  value={draft.shippingCost}
                  onChange={set('shippingCost')}
                  placeholder="0.00"
                />
              </label>
              <label className="goem-field">
                <span>customs_duties</span>
                <input
                  inputMode="decimal"
                  value={draft.dutiesCost}
                  onChange={set('dutiesCost')}
                  placeholder="0.00"
                />
              </label>

              <label className="goem-field goem-field-wide">
                <span>part_image (jpg/png, max 4MB)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    if (file && file.size > MAX_IMAGE_BYTES) {
                      setError('that photo is over 4MB — resize it and try again')
                      setStatus('error')
                      setImage(null)
                      return
                    }
                    setError('')
                    setStatus('idle')
                    setImage(file)
                  }}
                />
              </label>
              <label className="goem-field goem-field-wide">
                <span>notes</span>
                <textarea value={draft.notes} onChange={set('notes')} rows={2} />
              </label>
            </div>

            {request.quote?.hasImage && (
              <div className="goem-current-image">
                <img
                  src={partImageUrl(request.ref, request.quote.updatedAt)}
                  alt="current part photo"
                />
                <label className="goem-checkbox">
                  <input
                    type="checkbox"
                    checked={removeImage}
                    onChange={(e) => setRemoveImage(e.target.checked)}
                  />
                  <span>remove current image</span>
                </label>
              </div>
            )}

            <div className="goem-costs">
              <div className="goem-cost-row goem-cost-total">
                <span>total_landed_cost</span>
                <span>{formatMoney(total, draft.currency)}</span>
              </div>
            </div>

            <button type="submit" className="goem-btn" disabled={status === 'saving'}>
              {status === 'saving'
                ? '> publishing...'
                : request.quote
                  ? '> update published quote'
                  : '> publish quote'}
            </button>
            <p className="goem-hint">
              Publishing unlocks this reference in access_quote.sh — the customer sees
              the part details, photo and the full landed cost.
            </p>
            {status === 'saved' && (
              <p className="goem-success">$ 200 &gt; quote published for {request.ref}</p>
            )}
            {status === 'error' && <p className="goem-error">$ error: {error}</p>}
          </form>

          <div className="goem-danger-zone">
            {confirmingDelete ? (
              <>
                <span className="goem-danger-text">
                  $ delete {request.ref} for good? the record, its quote and photo go, and
                  the customer's access link stops working.
                </span>
                <div className="goem-danger-actions">
                  <button
                    type="button"
                    className="goem-btn goem-btn-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? '> deleting...' : '> yes, delete it'}
                  </button>
                  <button
                    type="button"
                    className="goem-link-btn"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    &gt; cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="goem-link-btn goem-link-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                &gt; rm --force {request.ref}
              </button>
            )}
            {deleteError && <p className="goem-error">$ error: {deleteError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
