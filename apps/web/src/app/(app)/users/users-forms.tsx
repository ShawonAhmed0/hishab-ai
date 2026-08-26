"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { ROLES, type Role } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { attempt } from "@/lib/attempt";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  addMemberAction,
  changeRoleAction,
  removeMemberAction,
  type UsersState,
} from "./actions";

export function AddMemberForm() {
  const t = useT();
  const [state, action, pending] = useActionState<UsersState, FormData>(addMemberAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t.users.addMember}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{t.users.addMember}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t.actions.close}
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
            {t.users.added}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field hint={t.users.phoneHint}>
            <FieldLabel required>{t.fields.phone}</FieldLabel>
            <Input name="phone" required inputMode="tel" placeholder="01712345678" />
          </Field>

          <Field>
            <FieldLabel required>{t.users.roleColumn}</FieldLabel>
            <Select name="role" defaultValue="operator">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t.role[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? t.users.adding : t.actions.addNew}
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
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [value, setValue] = useState(role);

  if (disabled) {
    return <span className="text-sm">{t.role[role]}</span>;
  }

  return (
    <span className="flex flex-col gap-1">
      <FilterSelect
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Role;
          const previous = value;
          setValue(next);
          setError(undefined);
          start(async () => {
            const [result, failure] = await attempt(() => changeRoleAction(userId, next));
            // The select was moved optimistically. A dropped request has to
            // put it back too, or the screen shows a role nobody was given.
            if (failure) {
              setError(t.errors.connectionTitle);
              setValue(previous);
              return;
            }
            if (result.error) {
              setError(result.error);
              setValue(previous);
            }
          });
        }}
        className="h-9 w-auto px-2 pr-8 text-sm"
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {t.role[option]}
          </option>
        ))}
      </FilterSelect>
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
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  if (disabled) return null;

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t.users.confirmRemove(name))) return;
          setError(undefined);
          start(async () => {
            const [result, failure] = await attempt(() => removeMemberAction(userId));
            if (failure) return setError(t.errors.connectionTitle);
            if (result.error) setError(result.error);
          });
        }}
        className="text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : t.users.remove}
      </button>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}
