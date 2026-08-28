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

/**
 * A published quote is 'issued' until an admin marks it paid; 'paid' is what
 * withdraws the payment link from the customer's record.
 */
export type QuoteState = 'issued' | 'paid'

/**
 * How the part travels. Mirrors `FreightMethod` in netlify/lib/freight.ts.
 */
export type FreightMethod = 'air' | 'sea'

export const FREIGHT_METHODS = ['air', 'sea'] as const

/**
 * Fixed commitments per option, not a figure calculated per quote. Mirrors
 * `FREIGHT_LEAD_TIMES` in netlify/lib/freight.ts.
 */
export const FREIGHT_LEAD_TIMES: Record<FreightMethod, string> = {
  air: '2-12 business days',
  sea: '40-45 days',
}

export const FREIGHT_LABELS: Record<FreightMethod, string> = {
  air: 'air_freight',
  sea: 'sea_freight',
}

export type QuoteRecord = {
  partName: string
  partNo: string
  vin: string
  details: string
  currency: string
  partCost: string
  /**
   * Sea freight. Stored in the `shipping_cost` column, which predates there
   * being a second option — the rename lives in this name.
   */
  seaFreightCost: string
  /** Null on quotes priced before air freight was offered. */
  airFreightCost: string | null
  dutiesCost: string
  /** The sea landed cost, as stored. Equal to `landedCostSea`. */
  totalCost: string
  /** part + sea freight + duties, worked out server-side. */
  landedCostSea: string
  /** part + air freight + duties, or null when there is no air figure. */
  landedCostAir: string | null
  /** Which option the customer accepted, null until they start payment. */
  freightMethod: FreightMethod | null
  notes: string
  state: QuoteState
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
