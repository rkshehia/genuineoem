import process from 'node:process'
import { adminGate } from '../lib/auth.js'
import { json, methodNotAllowed } from '../lib/http.js'
import { normalizeQuoteRef } from '../lib/quoteRef.js'

const API = 'https://api.netlify.com/api/v1'
const PER_PAGE = 100

/**
 * Netlify Forms is a notification channel, not the system of record, so the
 * submissions live outside our database — the only way to read them back is
 * the Netlify API, which needs a personal access token. Without one the
 * endpoint reports itself unconfigured rather than failing: the rest of the
 * quote desk works fine, it just can't show the inbox.
 */
// Deliberately only NETLIFY_API_TOKEN: the CLI injects its own
// NETLIFY_AUTH_TOKEN during `netlify dev`, and falling back to it would make a
// site with no token configured report "token rejected" instead of "not set up".
const apiToken = () => process.env.NETLIFY_API_TOKEN || ''
const siteId = () => process.env.SITE_ID || process.env.NETLIFY_SITE_ID || ''

/** Envelope fields Netlify adds itself, plus ones we surface separately. */
const HIDDEN_FIELDS = new Set([
  'form-name',
  'bot-field',
  'subject',
  'quote_ref',
  'ip',
  'user_agent',
  'referrer',
])

type RawSubmission = {
  id?: string | number
  form_name?: string
  created_at?: string
  email?: string
  name?: string
  data?: Record<string, unknown>
}

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const denied = adminGate(req)
  if (denied) return denied

  const token = apiToken()
  const site = siteId()
  if (!token || !site) {
    return json({
      configured: false,
      submissions: [],
      message:
        'Set the NETLIFY_API_TOKEN environment variable to a personal access token to read form submissions here.',
    })
  }

  try {
    const res = await fetch(`${API}/sites/${site}/submissions?per_page=${PER_PAGE}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      // The token is the usual culprit — expired, revoked, or scoped to a
      // different team — so say so instead of a bare status code.
      const reason =
        res.status === 401 || res.status === 403
          ? 'the NETLIFY_API_TOKEN was rejected — check it is a valid personal access token for this team'
          : `the Netlify API answered ${res.status}`
      return json({ error: 'forms_unavailable', message: `could not load submissions: ${reason}` }, 502)
    }

    const raw = (await res.json()) as RawSubmission[]
    const submissions = (Array.isArray(raw) ? raw : []).map(normalise)
    submissions.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    return json({ configured: true, submissions })
  } catch (err) {
    console.error('admin-submissions failed', err)
    return json({ error: 'forms_unavailable', message: 'could not reach the Netlify API' }, 502)
  }
}

function normalise(row: RawSubmission) {
  const data = row.data ?? {}
  const rawRef = typeof data.quote_ref === 'string' ? data.quote_ref : ''
  return {
    id: String(row.id ?? ''),
    formName: row.form_name || 'unknown',
    // Normalised so a reference typed by hand into a follow-up still lines up
    // with the request it belongs to.
    ref: rawRef ? normalizeQuoteRef(rawRef) : '',
    email: row.email || (typeof data.email === 'string' ? data.email : ''),
    name: row.name || (typeof data.name === 'string' ? data.name : ''),
    createdAt: row.created_at ?? null,
    fields: Object.entries(data)
      .filter(([key, value]) => !HIDDEN_FIELDS.has(key) && value !== '' && value != null)
      .map(([key, value]) => ({ key, value: String(value) })),
  }
}
