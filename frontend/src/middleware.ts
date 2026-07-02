import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth guard middleware.
 * Checks for the presence of the Zustand auth cookie (persisted by zustand/persist).
 * If user is not logged in, redirects to /login.
 * Public routes: /login, /_next, /api, static assets.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for auth state in cookie (zustand persist stores in localStorage,
  // but we also check for the Odoo session cookie 'session_id')
  const sessionCookie = request.cookies.get('session_id');

  if (!sessionCookie?.value) {
    // No Odoo session — redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
