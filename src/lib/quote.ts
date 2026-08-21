export type QuoteRequestRecord = {
  ref: string
  name: string
  email: string
  phone: string
  partNo: string
  vehicleId: string
  destinationCountry: string
  message: string
  createdAt: string | null
}

export type QuoteRecord = {
  partName: string
  partNo: string
  vin: string
  details: string
  currency: string
  partCost: string
  shippingCost: string
  dutiesCost: string
  totalCost: string
  leadTime: string
  notes: string
  hasImage: boolean
  updatedAt: string | null
}

/**
 * A Netlify Forms submission read back through the Netlify API. `ref` is the
 * quote it belongs to, or '' for a submission we can't tie to a request.
 */
export type FormSubmission = {
  id: string
  formName: string
  ref: string
  email: string
  name: string
  createdAt: string | null
  fields: { key: string; value: string }[]
}

export type LookupResult =
  | { status: 'not_found' }
  // The lookup answers a server-side failure with this shape and no record
  // attached, so it has to be part of the union: leaving it out let callers
  // reach for `request` on a response that never carries one.
  | { status: 'error'; message?: string }
  | { status: 'processing'; request: QuoteRequestRecord }
  | { status: 'ready'; request: QuoteRequestRecord; quote: QuoteRecord }

export const CURRENCIES = ['GBP', 'KES', 'USD', 'EUR'] as const

export function formatMoney(value: string | number, currency: string) {
  const amount = typeof value === 'number' ? value : Number.parseFloat(value || '0')
  const safe = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      currencyDisplay: 'narrowSymbol',
    }).format(safe)
  } catch {
    return `${currency} ${safe.toFixed(2)}`
  }
}

export function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
