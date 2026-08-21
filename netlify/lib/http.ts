export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })
}

export function methodNotAllowed(allowed: string) {
  return json({ error: 'method_not_allowed' }, 405, { allow: allowed })
}
