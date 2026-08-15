"use server";

import { revalidatePath } from "next/cache";
import { cancelTransaction, PermissionError } from "@hishabai/core";
import { requireSession } from "@/lib/session";

export interface CancelState {
  ok?: boolean;
  error?: string;
  reversalVoucherNo?: string;
}

/**
 * Cancelling never deletes. It marks the entry cancelled and posts a
 * mirror-image reversal, so the ledger keeps both and an audit can see what
 * happened and who decided otherwise (spec §18).
 */
export async function cancelTransactionAction(
  transactionId: string,
  reason: string,
): Promise<CancelState> {
  const session = await requireSession();

  if (reason.trim().length < 3) {
    return { error: "বাতিলের কারণ লিখুন" };
  }

  try {
    const result = await cancelTransaction(session, transactionId, reason.trim());
    revalidatePath("/transactions");
    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath("/dashboard");
    return { ok: true, reversalVoucherNo: result.reversalVoucherNo };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.messageBn };
    console.error("cancelTransactionAction failed", error);
    return { error: "বাতিল করা যায়নি। আবার চেষ্টা করুন।" };
  }
}
