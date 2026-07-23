import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

// `/api/fx-rates/cron` is hit by Vercel Cron (no session cookie); it guards
// itself with CRON_SECRET, so let it through the auth check here.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/fx-rates/cron']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check session
  const token = request.cookies.get('wealth_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const session = await verifySession(token)
  if (!session) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('wealth_session')
    return response
  }

  // Add user info to headers for API routes
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', String(session.id))
  requestHeaders.set('x-user-email', session.email)
  requestHeaders.set('x-user-name', session.name)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
