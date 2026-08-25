import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Where an emailed link lands — password recovery, and email confirmation.
 *
 * Supabase sends the user here with a one-time `code`, which is exchanged for
 * a session. Until this route existed the app sent reset emails and had nowhere
 * to receive the click: the link arrived, the middleware saw no session, and
 * the visitor was bounced to /login having achieved nothing. "পাসওয়ার্ড ভুলে
 * গেছেন?" led in a circle.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // A recovery link is single use and time limited, so an expired one is the
  // ordinary case rather than an exception — say so on the login page instead
  // of showing a stack trace.
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
