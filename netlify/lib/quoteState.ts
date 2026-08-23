/**
 * A published quote is 'issued' until an admin marks it paid. Mirrors
 * `QuoteState` in src/lib/quote.ts — the functions cannot import from the
 * client bundle, so the pair has to be kept in step by hand.
 */
export type QuoteState = 'issued' | 'paid'

export const isQuoteState = (value: unknown): value is QuoteState =>
  value === 'issued' || value === 'paid'

/**
 * The column is plain text, so anything unrecognised (an older row, a hand
 * edit) reads back as 'issued' — the state that keeps the customer's payment
 * link available rather than silently withdrawing it.
 */
export const asQuoteState = (value: unknown): QuoteState =>
  isQuoteState(value) ? value : 'issued'
