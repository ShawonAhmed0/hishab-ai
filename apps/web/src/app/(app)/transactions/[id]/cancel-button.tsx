"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { bn } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cancelTransactionAction } from "./actions";

export function CancelTransactionButton({
  transactionId,
  voucherNo,
}: {
  transactionId: string;
  voucherNo: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [pending, startTransition] = React.useTransition();

  function confirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await cancelTransactionAction(transactionId, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(bn.messages.cancelled, `বিপরীত এন্ট্রি ${result.reversalVoucherNo}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="destructive">{bn.actions.cancel}</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-overlay">
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="size-5 text-debit" aria-hidden />
            লেনদেন বাতিল করবেন?
          </Dialog.Title>

          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {voucherNo} মুছে যাবে না। এর প্রভাব বাতিল করতে একটি বিপরীত এন্ট্রি তৈরি হবে,
            এবং দুটোই হিসাবের খাতায় থেকে যাবে।
          </Dialog.Description>

          <div className="mt-4">
            <Field error={error}>
              <FieldLabel required>বাতিলের কারণ</FieldLabel>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="যেমন: ভুল কাস্টমারের নামে এন্ট্রি হয়েছিল"
              />
            </Field>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{bn.actions.close}</Button>
            </Dialog.Close>
            <Button variant="destructive" loading={pending} onClick={confirm}>
              {bn.actions.confirm}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
