export function corsHeaders(origin: string | null, allowed: string): HeadersInit {
  const allowOrigin = origin && (allowed === '*' || allowed.split(',').map(s => s.trim()).includes(origin))
    ? origin
    : allowed.split(',')[0]?.trim() ?? '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}
