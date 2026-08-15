"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureProfile } from "@hishabai/core";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.string().trim().email("ইমেইল ঠিকানাটি সঠিক নয়"),
  password: z.string().min(8, "পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে"),
});

const registration = credentials.extend({
  fullName: z.string().trim().min(1, "আপনার নাম দিন").max(160),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "তথ্য সঠিক নয়";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague: saying which half was wrong tells an attacker which
    // addresses are registered.
    return { error: "ইমেইল বা পাসওয়ার্ড মিলছে না" };
  }

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registration.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) return { error: error.message };

  if (!data.session) {
    return { notice: "ইমেইলে পাঠানো লিংকে ক্লিক করে অ্যাকাউন্ট নিশ্চিত করুন।" };
  }

  await ensureProfile(data.user!.id, parsed.data.fullName);
  redirect("/onboarding");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "ইমেইল ঠিকানাটি সঠিক নয়" };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data);

  // Always the same answer, whether or not the address exists.
  return { notice: "যদি অ্যাকাউন্ট থেকে থাকে, রিসেট লিংক পাঠানো হয়েছে।" };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
