// Functions are called on their reserved `/.netlify/functions/*` paths: the
// TanStack Start SSR handler owns every other route and would swallow the
// request before it reached the function.
const BASE = '/.netlify/functions'

export const api = {
  quoteRequest: `${BASE}/quote-request`,
  quoteLookup: `${BASE}/quote-lookup`,
  adminSession: `${BASE}/admin-session`,
  adminRequests: `${BASE}/admin-requests`,
  adminRequest: `${BASE}/admin-request`,
  adminQuote: `${BASE}/admin-quote`,
  adminSubmissions: `${BASE}/admin-submissions`,
  partImage: `${BASE}/part-image`,
}

export function partImageUrl(ref: string, cacheKey?: string | null) {
  const bust = cacheKey ? `&v=${encodeURIComponent(cacheKey)}` : ''
  return `${api.partImage}?ref=${encodeURIComponent(ref)}${bust}`
}

export async function readError(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message || body.error || fallback
  } catch {
    return fallback
  }
}
