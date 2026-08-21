// Human-typable alphabet: no 0/1/I/O so a reference read off an email can be
// re-typed without ambiguity. Must stay in sync with src/lib/quoteRef.ts.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function encode(value: number, length: number) {
  let out = ''
  let n = value
  for (let i = 0; i < length; i++) {
    out = ALPHABET[n % ALPHABET.length] + out
    n = Math.floor(n / ALPHABET.length)
  }
  return out
}

function randomChars(length: number) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * Builds a reference like `GO-7K4M-Q9P`: four time-derived characters so
 * references sort roughly by age, three random ones so two requests filed in
 * the same minute can't collide.
 */
export function generateQuoteRef() {
  return `GO-${encode(Date.now(), 4)}-${randomChars(3)}`
}

/** Accepts what a customer actually types — `go 7k4mq9p`, `GO-7K4M-Q9P` — and normalises it. */
export function normalizeQuoteRef(input: string) {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = cleaned.startsWith('GO') ? cleaned.slice(2) : cleaned
  if (!body) return ''
  if (body.length !== 7) return `GO-${body}`
  return `GO-${body.slice(0, 4)}-${body.slice(4)}`
}
