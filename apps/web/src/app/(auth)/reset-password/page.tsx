"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { requestPasswordReset, type AuthState } from "../actions";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {},
  );

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">পাসওয়ার্ড রিসেট</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            ইমেইল দিন, রিসেট লিংক পাঠানো হবে
          </p>
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
            <FieldLabel required>ইমেইল</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" block loading={pending}>
            রিসেট লিংক পাঠান
          </Button>
        </form>

        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            লগইনে ফিরে যান
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
