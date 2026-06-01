const REALM = 'O-Agent Omni'

export const config = {
  matcher: '/((?!webhook/|api/webhook/).*)',
}

export default function middleware(request) {
  const password = process.env.OMNI_ACCESS_PASSWORD || ''
  if (!password) return undefined

  const user = process.env.OMNI_ACCESS_USER || 'boss'
  const authorization = request.headers.get('authorization') || ''
  const expected = `Basic ${btoa(`${user}:${password}`)}`
  if (authorization === expected) return undefined

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
