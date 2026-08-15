"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { signIn, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">লগইন করুন</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            আপনার ব্যবসার হিসাব দেখতে লগইন করুন
          </p>
        </div>

        {state.error ? (
          <div role="alert" className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit">
            {state.error}
          </div>
        ) : null}

        <form action={action} className="space-y-4">
          <Field>
            <FieldLabel required>ইমেইল</FieldLabel>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>

          <Field>
            <FieldLabel required>পাসওয়ার্ড</FieldLabel>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          <Button type="submit" block loading={pending}>
            লগইন
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link href="/reset-password" className="text-primary hover:underline">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
          <Link href="/register" className="text-primary hover:underline">
            নতুন অ্যাকাউন্ট
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
