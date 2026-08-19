"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { useT } from "@/components/locale-provider";
import { createCompanyAction, type CompanyFormState } from "./actions";

export default function OnboardingPage() {
  const t = useT();
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
          <h1 className="text-2xl font-bold tracking-tight">{t.onboarding.title}</h1>
          <p className="text-sm text-muted-foreground">{t.onboarding.subtitle}</p>
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
                <FieldLabel required>{t.onboarding.companyName}</FieldLabel>
                <Input name="name" required placeholder="Paper Star" autoFocus />
              </Field>

              <Field hint={t.onboarding.companyNameHint}>
                <FieldLabel>{t.onboarding.bengaliName}</FieldLabel>
                <Input name="nameBn" placeholder={t.onboarding.bengaliNamePlaceholder} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t.onboarding.businessType}</FieldLabel>
                  <Input
                    name="businessType"
                    placeholder={t.onboarding.businessTypePlaceholder}
                  />
                </Field>

                <Field>
                  <FieldLabel>{t.fields.phone}</FieldLabel>
                  <Input name="phone" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" />
                </Field>
              </div>

              <Field>
                <FieldLabel>{t.fields.address}</FieldLabel>
                <Textarea name="address" rows={2} />
              </Field>

              <Field hint={t.onboarding.fiscalYearHint}>
                <FieldLabel>{t.onboarding.fiscalYearStart}</FieldLabel>
                <Select name="fiscalYearStartMonth" defaultValue="7">
                  {t.months.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" block size="lg" loading={pending}>
                {t.onboarding.createCompany}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
