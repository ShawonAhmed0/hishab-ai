"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { useT } from "@/components/locale-provider";
import { signUp, type AuthState } from "../actions";

export default function RegisterPage() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t.auth.registerTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.auth.registerSubtitle}</p>
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
            <FieldLabel required>{t.auth.yourName}</FieldLabel>
            <Input
              name="fullName"
              autoComplete="name"
              required
              placeholder={t.auth.namePlaceholder}
            />
          </Field>

          <Field>
            <FieldLabel required>{t.auth.email}</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>

          <Field hint={t.auth.passwordHint}>
            <FieldLabel required>{t.auth.password}</FieldLabel>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>

          <Button type="submit" block loading={pending}>
            {t.auth.createAccount}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t.auth.haveAccount}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t.auth.loginTitle}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
