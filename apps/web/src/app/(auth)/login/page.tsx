"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { useT } from "@/components/locale-provider";
import { signIn, type AuthState } from "../actions";

export default function LoginPage() {
  return (
    // useSearchParams needs a boundary, and the form does not depend on it.
    <Suspense fallback={<LoginForm />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  // /auth/callback sends an expired or already-used recovery link here rather
  // than showing a stack trace. A link is single use and time limited, so this
  // is an ordinary Tuesday, not an exception.
  const linkFailed = useSearchParams().get("error") === "link";

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t.auth.loginTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.auth.loginSubtitle}</p>
        </div>

        {state.error || linkFailed ? (
          <div role="alert" className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit">
            {state.error ?? t.auth.linkProblem}
          </div>
        ) : null}

        <form action={action} className="space-y-4">
          <Field>
            <FieldLabel required>{t.auth.email}</FieldLabel>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>

          <Field>
            <FieldLabel required>{t.auth.password}</FieldLabel>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          <Button type="submit" block loading={pending}>
            {t.auth.login}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link href="/reset-password" className="text-primary hover:underline">
            {t.auth.forgotPassword}
          </Link>
          <Link href="/register" className="text-primary hover:underline">
            {t.auth.newAccount}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
