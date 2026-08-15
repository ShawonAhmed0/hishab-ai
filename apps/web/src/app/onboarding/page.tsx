"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { createCompanyAction, type CompanyFormState } from "./actions";

const MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

export default function OnboardingPage() {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(
    createCompanyAction,
    {},
  );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Building2 className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">কোম্পানি যোগ করুন</h1>
          <p className="text-sm text-muted-foreground">
            প্রতিটি কোম্পানির হিসাব সম্পূর্ণ আলাদা থাকে
          </p>
        </div>

        <Card>
          <CardBody className="space-y-4">
            {state.error ? (
              <div role="alert" className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit">
                {state.error}
              </div>
            ) : null}

            <form action={action} className="space-y-4">
              <Field>
                <FieldLabel required>কোম্পানির নাম</FieldLabel>
                <Input name="name" required placeholder="Paper Star" autoFocus />
              </Field>

              <Field hint="রিপোর্ট ও প্রিন্টে এই নামটি দেখাবে">
                <FieldLabel>বাংলা নাম</FieldLabel>
                <Input name="nameBn" placeholder="পেপার স্টার" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>ব্যবসার ধরন</FieldLabel>
                  <Input name="businessType" placeholder="কাগজ ব্যবসা" />
                </Field>

                <Field>
                  <FieldLabel>মোবাইল</FieldLabel>
                  <Input name="phone" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" />
                </Field>
              </div>

              <Field>
                <FieldLabel>ঠিকানা</FieldLabel>
                <Textarea name="address" rows={2} />
              </Field>

              <Field hint="বাংলাদেশে সাধারণত জুলাই থেকে শুরু হয়">
                <FieldLabel>হিসাব বছর শুরু</FieldLabel>
                <Select name="fiscalYearStartMonth" defaultValue="7">
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" block size="lg" loading={pending}>
                কোম্পানি তৈরি করুন
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
