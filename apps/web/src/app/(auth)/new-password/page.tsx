"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { useT } from "@/components/locale-provider";
import { setNewPassword, type AuthState } from "../actions";

/**
 * The other half of the reset.
 *
 * A "forgot password" link that cannot finish is worse than no link at all,
 * and until this page existed the app had exactly that: it sent the email and
 * had nowhere to receive the click.
 *
 * Reached from /auth/callback, which has already exchanged the emailed code for
 * a session. That session is what authorises the change — there is no token in
 * this form and none left in the URL by the time the user sees it.
 */
export default function NewPasswordPage() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(setNewPassword, {});

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t.auth.newPasswordTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t.auth.newPasswordSubtitle}
          </p>
        </div>

        {state.error ? (
          <div
            role="alert"
            className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit"
          >
            {state.error}
          </div>
        ) : null}

        <form action={action} className="space-y-4">
          <Field>
            <FieldLabel required>{t.auth.newPassword}</FieldLabel>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel required>{t.auth.confirmPassword}</FieldLabel>
            <Input name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <Button type="submit" block loading={pending}>
            {t.auth.savePassword}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
