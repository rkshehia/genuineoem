// Netlify detects forms by scanning static HTML at build time, so submissions have
// to POST to a real static path. Posting to `/` is swallowed by the TanStack Start
// SSR handler, which answers 200 without the request ever reaching form processing.
const FORM_ENDPOINT = '/quote-form.html'

export async function submitNetlifyForm(
  formName: string,
  fields: Record<string, string>,
) {
  const body = Object.entries({ 'form-name': formName, ...fields })
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join('&')

  const res = await fetch(FORM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`form submission failed: ${res.status}`)
}
