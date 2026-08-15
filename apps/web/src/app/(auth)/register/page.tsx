"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { signUp, type AuthState } from "../actions";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">নতুন অ্যাকাউন্ট খুলুন</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            কয়েক মিনিটেই ব্যবসার হিসাব শুরু করুন
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
            <FieldLabel required>আপনার নাম</FieldLabel>
            <Input name="fullName" autoComplete="name" required placeholder="মোঃ রফিকুল ইসলাম" />
          </Field>

          <Field>
            <FieldLabel required>ইমেইল</FieldLabel>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>

          <Field hint="অন্তত ৮ অক্ষর">
            <FieldLabel required>পাসওয়ার্ড</FieldLabel>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>

          <Button type="submit" block loading={pending}>
            অ্যাকাউন্ট তৈরি করুন
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          অ্যাকাউন্ট আছে?{" "}
          <Link href="/login" className="text-primary hover:underline">
            লগইন করুন
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
