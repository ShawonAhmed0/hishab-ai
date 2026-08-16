"use server";

import { revalidatePath } from "next/cache";
import { markAllNotificationsRead } from "@hishabai/core";
import { requireSession } from "@/lib/session";

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireSession();
  await markAllNotificationsRead(session);
  // The bell lives in the layout, so the whole shell has to re-read.
  revalidatePath("/", "layout");
}
