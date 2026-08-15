"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createCompany, ensureProfile } from "@hishabai/core";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/session";
import { getAuthUser } from "@/lib/supabase/server";

export interface CompanyFormState {
  error?: string;
}

export async function createCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // First company for a brand-new account: the profile row may not exist yet.
  await ensureProfile(
    user.id,
    (user.user_metadata?.["full_name"] as string | undefined) ??
      user.email?.split("@")[0] ??
      "ব্যবহারকারী",
  );

  let companyId: string;
  try {
    companyId = await createCompany(user.id, {
      name: formData.get("name"),
      nameBn: formData.get("nameBn") || undefined,
      businessType: formData.get("businessType") || undefined,
      phone: formData.get("phone") || undefined,
      address: formData.get("address") || undefined,
      fiscalYearStartMonth: Number(formData.get("fiscalYearStartMonth") ?? 7),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "কোম্পানি তৈরি করা যায়নি",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}

/** Switching companies is just re-pointing the cookie; the session rebuilds. */
export async function switchCompanyAction(companyId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}
