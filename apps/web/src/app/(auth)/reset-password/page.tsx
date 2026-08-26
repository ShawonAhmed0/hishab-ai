"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { useT } from "@/components/locale-provider";
import { requestPasswordReset, type AuthState } from "../actions";

export default function ResetPasswordPage() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {},
  );

  return (
    <Card className="border-border/80 shadow-raised">
      <CardBody className="space-y-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t.auth.resetTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.auth.resetSubtitle}</p>
        </div>

        {state.error ? (
          <div role="alert" className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit">
            {state.error}
          </div>
        ) : null}
        {state.notice ? (
          <div role="status" className="rounded-md border border-info bg-info-soft p-3 text-sm text-info">
            {state.notice}
          </div>
        ) : null}

        <form action={action} className="space-y-4">
          <Field>
            <FieldLabel required>{t.auth.email}</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" block loading={pending}>
            {t.auth.sendResetLink}
          </Button>
        </form>

        <p className="text-center text-sm">
          <Link href="/login" className="text-primary-ink hover:underline">
            {t.auth.backToLogin}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
