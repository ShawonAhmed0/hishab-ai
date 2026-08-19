"use server";

import { revalidatePath } from "next/cache";
import { PermissionError, addMember, changeMemberRole, removeMember } from "@hishabai/core";
import { dict } from "@/lib/locale.server";
import { requireSession } from "@/lib/session";

export interface UsersState {
  ok?: boolean;
  error?: string;
}

/**
 * The database raises these in Bengali already — `app.add_member_by_phone`
 * refuses a non-admin and an unknown number with the message the user should
 * see. postgres.js wraps them, so the text is recovered rather than replaced
 * with a generic apology that hides which of the two happened.
 */
async function messageFor(error: unknown): Promise<string> {
  if (error instanceof PermissionError) return (await dict()).messages.notAllowed;
  if (error instanceof Error && /[ঀ-৿]/.test(error.message)) {
    return error.message;
  }
  console.error("users action failed", error);
  return (await dict()).users.actionFailed;
}

export async function addMemberAction(
  _prev: UsersState,
  form: FormData,
): Promise<UsersState> {
  const session = await requireSession();
  const phone = String(form.get("phone") ?? "").trim();

  try {
    await addMember(session, phone, form.get("role"));
    revalidatePath("/users");
    return { ok: true };
  } catch (error) {
    return { error: await messageFor(error) };
  }
}

export async function changeRoleAction(userId: string, role: string): Promise<UsersState> {
  const session = await requireSession();

  try {
    await changeMemberRole(session, userId, role);
    revalidatePath("/users");
    return { ok: true };
  } catch (error) {
    return { error: await messageFor(error) };
  }
}

export async function removeMemberAction(userId: string): Promise<UsersState> {
  const session = await requireSession();

  try {
    await removeMember(session, userId);
    revalidatePath("/users");
    return { ok: true };
  } catch (error) {
    return { error: await messageFor(error) };
  }
}
