import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookiesToSet = { name: string; value: string; options?: CookieOptions }[];

const PUBLIC_PATHS = ["/login", "/register", "/reset-password", "/auth"];

/**
 * The id of the user this middleware verified, handed to the page.
 *
 * `getUser()` is a network call to the auth service. Doing it here and again
 * in the page meant two of them per navigation. The page trusts this header
 * only because the middleware unconditionally strips any inbound copy first —
 * see `forwardVerifiedUser`.
 */
export const VERIFIED_USER_HEADER = "x-hishabai-verified-user";

/**
 * Rebuilds the request headers with our verified-user header set, and any
 * client-supplied copy of it removed. A browser cannot forge it because this
 * runs on every matched route and always overwrites.
 */
function forwardVerifiedUser(request: NextRequest, userId: string | null): Headers {
  const headers = new Headers(request.headers);
  headers.delete(VERIFIED_USER_HEADER);
  if (userId) headers.set(VERIFIED_USER_HEADER, userId);
  return headers;
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors off the application routes.
 *
 * This is a routing guard, not an authorisation boundary — the actual
 * authorisation lives in RLS and in the permission checks in @hishabai/core.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the JWT signature locally against the project's JWKS
  // (fetched once and cached) instead of calling the auth service on every
  // request. Same guarantee — a forged or expired token still fails — without
  // a network round trip per navigation.
  //
  // If auth is unreachable entirely, treat the visitor as signed out rather
  // than returning a 500: they land on the login page, which is the truthful
  // outcome and the one they can act on.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    user = data?.claims?.sub ? { id: data.claims.sub } : null;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Hand the verified id down so the page does not repeat the auth round trip.
  const forwarded = NextResponse.next({
    request: { headers: forwardVerifiedUser(request, user?.id ?? null) },
  });
  for (const cookie of response.cookies.getAll()) forwarded.cookies.set(cookie);
  return forwarded;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
