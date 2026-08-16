"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { ROLES, bn, type Role } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import {
  addMemberAction,
  changeRoleAction,
  removeMemberAction,
  type UsersState,
} from "./actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<UsersState, FormData>(addMemberAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        ব্যবহারকারী যোগ করুন
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">ব্যবহারকারী যোগ করুন</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={bn.actions.close}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <form action={action} className="space-y-4">
        {state.error ? (
          <div
            role="alert"
            className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit"
          >
            {state.error}
          </div>
        ) : null}
        {state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-credit">
            <Check className="size-4" aria-hidden />
            যোগ করা হয়েছে
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field hint="যে নম্বর দিয়ে তিনি HishabAI-এ রেজিস্টার করেছেন">
            <FieldLabel required>{bn.fields.phone}</FieldLabel>
            <Input name="phone" required inputMode="tel" placeholder="01712345678" />
          </Field>

          <Field>
            <FieldLabel required>ভূমিকা</FieldLabel>
            <Select name="role" defaultValue="operator">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {bn.role[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "যোগ হচ্ছে…" : bn.actions.addNew}
        </Button>
      </form>
    </div>
  );
}

/**
 * The role changes on selection rather than behind a save button.
 *
 * There is one field, the effect is immediate and reversible, and a save button
 * next to a dropdown invites the reading that nothing happened until you press
 * it. Errors — the last admin, or yourself — come back under the control.
 */
export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [value, setValue] = useState(role);

  if (disabled) {
    return <span className="text-sm">{bn.role[role]}</span>;
  }

  return (
    <span className="flex flex-col gap-1">
      <select
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Role;
          const previous = value;
          setValue(next);
          setError(undefined);
          start(async () => {
            const result = await changeRoleAction(userId, next);
            if (result.error) {
              setError(result.error);
              setValue(previous);
            }
          });
        }}
        className="h-9 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {bn.role[option]}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}

export function RemoveMemberButton({
  userId,
  name,
  disabled,
}: {
  userId: string;
  name: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  if (disabled) return null;

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`${name} কে সরাবেন? তাঁর করা এন্ট্রিগুলো থেকে যাবে।`)) return;
          setError(undefined);
          start(async () => {
            const result = await removeMemberAction(userId);
            if (result.error) setError(result.error);
          });
        }}
        className="text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : "সরান"}
      </button>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}
