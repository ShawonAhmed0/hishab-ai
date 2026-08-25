"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureProfile, resolveSession } from "@hishabai/core";
import type { Dictionary } from "@hishabai/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dict } from "@/lib/locale.server";
import { rememberActiveCompany } from "@/lib/session";

export interface AuthState {
  error?: string;
  notice?: string;
}

// Built per request rather than at module scope: the messages come from the
// dictionary, and a module-level schema would freeze whichever locale served
// the first sign-in the process ever handled.
function credentials(t: Dictionary) {
  return z.object({
    email: z.string().trim().email(t.auth.invalidEmail),
    password: z.string().min(8, t.auth.passwordTooShort),
  });
}

function registration(t: Dictionary) {
  return credentials(t).extend({
    fullName: z.string().trim().min(1, t.auth.nameRequired).max(160),
  });
}

function firstError(error: z.ZodError, t: Dictionary): string {
  return error.issues[0]?.message ?? t.auth.invalidInput;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await dict();
  const parsed = credentials(t).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error, t) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague: saying which half was wrong tells an attacker which
    // addresses are registered.
    return { error: t.auth.wrongCredentials };
  }

  // Which company they land in, decided once here rather than rediscovered on
  // every request. Every page after this can then start its own query straight
  // away instead of waiting to be told which company to ask about.
  const { companies } = await resolveSession(data.user.id);
  const landing = companies[0]?.id;
  if (!landing) redirect("/onboarding");

  await rememberActiveCompany(landing);
  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await dict();
  const parsed = registration(t).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: firstError(parsed.error, t) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  // Not `error.message`: that is the provider's English, on a Bengali screen,
  // and "User already registered" tells whoever is asking that the address has
  // an account here. Supabase obscures that case itself when confirmations are
  // on — this makes sure we do not undo it.
  if (error) return { error: t.auth.signUpFailed };

  if (!data.session) {
    return { notice: t.auth.confirmByEmail };
  }

  await ensureProfile(data.user!.id, parsed.data.fullName);
  redirect("/onboarding");
}

/**
 * Where Supabase should send the person after they click the emailed link.
 *
 * Built from the request rather than from an env var so it is right in
 * development, in a preview deployment and in production without three
 * settings to keep in step. Supabase will only honour it if the URL is on the
 * project's redirect allow-list, which is the check that stops this being a
 * way to point reset emails anywhere.
 */
async function callbackUrl(next: string): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await dict();
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: t.auth.invalidEmail };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: await callbackUrl("/new-password"),
  });

  // Always the same answer, whether or not the address exists.
  return { notice: t.auth.resetSent };
}

/**
 * Finishes the reset.
 *
 * Authorised by the session /auth/callback established from the emailed code,
 * not by anything in this form — so a stale tab that never went through the
 * link has no session and is refused here rather than silently doing nothing.
 */
export async function setNewPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await dict();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: t.auth.passwordTooShort };
  if (password !== confirm) return { error: t.auth.passwordsDoNotMatch };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: t.auth.resetLinkExpired };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t.auth.resetFailed };

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
