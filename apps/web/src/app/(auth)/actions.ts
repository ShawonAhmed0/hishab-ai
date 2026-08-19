"use server";

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

  if (error) return { error: error.message };

  if (!data.session) {
    return { notice: t.auth.confirmByEmail };
  }

  await ensureProfile(data.user!.id, parsed.data.fullName);
  redirect("/onboarding");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await dict();
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: t.auth.invalidEmail };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data);

  // Always the same answer, whether or not the address exists.
  return { notice: t.auth.resetSent };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
