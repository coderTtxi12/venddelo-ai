import { type NextRequest, NextResponse } from 'next/server';
import { extractMenuSubdomainFromHost } from '@/lib/restaurantSubdomain';
import { updateSession } from '@/lib/supabase/middleware';

function maybeRewriteMenuSubdomain(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host') ?? '';
  const subdomain = extractMenuSubdomainFromHost(host);
  if (!subdomain) return null;

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/menu/') || pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return null;
  }

  const rewritePath =
    pathname === '/' ? `/menu/${subdomain}` : `/menu/${subdomain}${pathname}`;

  return NextResponse.rewrite(new URL(rewritePath, request.url));
}

export async function middleware(request: NextRequest) {
  const menuRewrite = maybeRewriteMenuSubdomain(request);
  if (menuRewrite) return menuRewrite;

  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
