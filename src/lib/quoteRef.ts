// Human-typable alphabet: no 0/1/I/O so a reference read off an email can be
// re-typed without ambiguity. References themselves are minted server-side in
// netlify/lib/quoteRef.ts — this copy only has to recognise them.

/** Accepts what a customer actually types — `go 7k4mq9p`, `GO-7K4M-Q9P` — and normalises it. */
export function normalizeQuoteRef(input: string) {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = cleaned.startsWith('GO') ? cleaned.slice(2) : cleaned
  if (!body) return ''
  // Only reformat once it's a complete reference — half-typed input is left alone.
  if (body.length !== 7) return `GO-${body}`
  return `GO-${body.slice(0, 4)}-${body.slice(4)}`
}
