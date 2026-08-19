import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Auth is disabled when:
// - SKIP_AUTH=true is explicitly set, OR
// - No auth providers are configured (no Google OAuth and no admin credentials)
// This prevents the app from being locked out of the box before the user
// has configured their auth environment variables.
function authIsDisabled(): boolean {
  if (process.env.SKIP_AUTH === 'true') return true;
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasCredentials = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  return !hasGoogle && !hasCredentials;
}

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ req, token }) {
        if (authIsDisabled()) return true;

        const { pathname } = req.nextUrl;
        if (pathname.startsWith('/api/auth') || pathname === '/login') {
          return true;
        }

        return !!token;
      },
    },
  },
);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
