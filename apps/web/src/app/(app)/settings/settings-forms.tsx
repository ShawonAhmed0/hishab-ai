"use client";

import * as React from "react";
import { useActionState, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { bn, type FinancialAccountKind } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import {
  createCategoryAction,
  createProductCategoryAction,
  createUnitAction,
  createWalletAction,
  deactivateAction,
  deactivateRecipeAction,
  saveRecipeAction,
  updateCompanyAction,
  type SettingsState,
} from "./actions";
import type { CompanyProfile } from "@hishabai/core";

const MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

/** Success and failure look the same everywhere on this page. */
function Feedback({ state, done }: { state: SettingsState; done: string }) {
  if (state.error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-debit bg-debit-soft p-3 text-sm text-debit"
      >
        {state.error}
      </div>
    );
  }
  if (state.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-credit">
        <Check className="size-4" aria-hidden />
        {done}
      </p>
    );
  }
  return null;
}

export function CompanyForm({ company }: { company: CompanyProfile }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateCompanyAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} done="কোম্পানির তথ্য সংরক্ষিত হয়েছে" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>কোম্পানির নাম</FieldLabel>
          <Input name="name" required defaultValue={company.name} />
        </Field>
        <Field hint="রিপোর্ট ও প্রিন্টে এই নামটি দেখাবে">
          <FieldLabel>বাংলা নাম</FieldLabel>
          <Input name="nameBn" defaultValue={company.nameBn ?? ""} />
        </Field>
        <Field>
          <FieldLabel>ব্যবসার ধরন</FieldLabel>
          <Input name="businessType" defaultValue={company.businessType ?? ""} />
        </Field>
        <Field>
          <FieldLabel>{bn.fields.phone}</FieldLabel>
          <Input name="phone" inputMode="tel" defaultValue={company.phone ?? ""} />
        </Field>
      </div>

      <Field>
        <FieldLabel>{bn.fields.address}</FieldLabel>
        <Textarea name="address" rows={2} defaultValue={company.address ?? ""} />
      </Field>

      <Field hint="বাংলাদেশে অর্থবছর সাধারণত জুলাই থেকে শুরু হয়">
        <FieldLabel>অর্থবছর শুরুর মাস</FieldLabel>
        <Select name="fiscalYearStartMonth" defaultValue={String(company.fiscalYearStartMonth)}>
          {MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "সংরক্ষণ হচ্ছে…" : bn.actions.saveShort}
      </Button>
    </form>
  );
}

/**
 * The add-forms are collapsed until asked for.
 *
 * সেটিংস has five sections; showing five open forms at once turns a reference
 * page into a wall of inputs. The button is the affordance, the form is the
 * consequence.
 */
function AddPanel({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{label}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={bn.actions.close}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {children(() => setOpen(false))}
    </div>
  );
}

export function WalletForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createWalletAction,
    {},
  );
  const [kind, setKind] = useState<FinancialAccountKind>("bank");

  return (
    <AddPanel label="পেমেন্ট মাধ্যম যোগ করুন">
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done="পেমেন্ট মাধ্যম যোগ হয়েছে" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>ধরন</FieldLabel>
              <Select
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as FinancialAccountKind)}
              >
                <option value="cash">{bn.financialAccountKind.cash}</option>
                <option value="bank">{bn.financialAccountKind.bank}</option>
                <option value="mfs">{bn.financialAccountKind.mfs}</option>
              </Select>
            </Field>

            <Field>
              <FieldLabel required>নাম</FieldLabel>
              <Input name="nameBn" required placeholder="ইসলামী ব্যাংক" />
            </Field>

            {kind === "bank" ? (
              <>
                <Field>
                  <FieldLabel>ব্যাংকের নাম</FieldLabel>
                  <Input name="bankName" placeholder="Islami Bank" />
                </Field>
                <Field>
                  <FieldLabel>অ্যাকাউন্ট নম্বর</FieldLabel>
                  <Input name="accountNumber" inputMode="numeric" />
                </Field>
              </>
            ) : null}

            {kind === "mfs" ? (
              <Field>
                <FieldLabel>সেবাদাতা</FieldLabel>
                <Select name="mfsProvider" defaultValue="bkash">
                  {(["bkash", "nagad", "rocket", "upay", "other"] as const).map((provider) => (
                    <option key={provider} value={provider}>
                      {bn.mfsProvider[provider]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field hint="এখন এই মাধ্যমে যত টাকা আছে। খাতায় প্রারম্ভিক ব্যালেন্স হিসেবে বসবে।">
              <FieldLabel>{bn.fields.openingBalance}</FieldLabel>
              <Input name="openingBalance" inputMode="decimal" defaultValue="0" />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "যোগ হচ্ছে…" : bn.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function UnitForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createUnitAction,
    {},
  );

  return (
    <AddPanel label="একক যোগ করুন">
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done="একক যোগ হয়েছে" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel required>নাম</FieldLabel>
              <Input name="nameBn" required placeholder="কার্টন" />
            </Field>
            <Field>
              <FieldLabel required>সংক্ষিপ্ত রূপ</FieldLabel>
              <Input name="symbol" required placeholder="ctn" />
            </Field>
            <Field hint="পিস গুনতে ০, কেজিতে ৩">
              <FieldLabel>দশমিক ঘর</FieldLabel>
              <Select name="decimalPlaces" defaultValue="3">
                {[0, 1, 2, 3].map((places) => (
                  <option key={places} value={places}>
                    {places}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "যোগ হচ্ছে…" : bn.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function CategoryForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createCategoryAction,
    {},
  );

  return (
    <AddPanel label="খাত যোগ করুন">
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done="খাত যোগ হয়েছে" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>আয় না ব্যয়</FieldLabel>
              <Select name="type" defaultValue="expense">
                <option value="expense">{bn.transactionType.expense}</option>
                <option value="income">{bn.transactionType.income}</option>
              </Select>
            </Field>
            <Field hint="নতুন এন্ট্রিতে খাতের তালিকায় দেখাবে">
              <FieldLabel required>খাতের নাম</FieldLabel>
              <Input name="nameBn" required placeholder="গুদাম ভাড়া" />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "যোগ হচ্ছে…" : bn.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function ProductCategoryForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createProductCategoryAction,
    {},
  );

  return (
    <AddPanel label="পণ্যের ক্যাটাগরি যোগ করুন">
      {() => (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <Field className="min-w-[14rem] flex-1">
            <FieldLabel required>নাম</FieldLabel>
            <Input name="nameBn" required placeholder="কাগজ" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "যোগ হচ্ছে…" : bn.actions.addNew}
          </Button>
          <div className="w-full">
            <Feedback state={state} done="ক্যাটাগরি যোগ হয়েছে" />
          </div>
        </form>
      )}
    </AddPanel>
  );
}

interface RecipeProduct {
  id: string;
  nameBn: string;
  kind: string;
  unitSymbol: string;
}

interface RecipeRowState {
  key: string;
  productId: string;
  quantityPerUnit: string;
}

const recipeRowKey = () => Math.random().toString(36).slice(2);

/**
 * রেসিপি — one batch, written down.
 *
 * The row count is variable, so this posts a payload instead of a FormData:
 * flattening `inputs.0.productId` into form fields and reassembling them on the
 * server would be two extra places to get the indexing wrong.
 */
export function RecipeForm({
  products,
  recipe,
  onDone,
}: {
  products: RecipeProduct[];
  recipe?: {
    id: string;
    nameBn: string | null;
    outputProductId: string;
    expectedYieldPercent: string | null;
    notes: string | null;
    inputs: { productId: string; quantityPerUnit: string }[];
  };
  onDone?: () => void;
}) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, start] = useTransition();

  const [outputProductId, setOutputProductId] = useState(recipe?.outputProductId ?? "");
  const [nameBn, setNameBn] = useState(recipe?.nameBn ?? "");
  const [yieldPercent, setYieldPercent] = useState(recipe?.expectedYieldPercent ?? "");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [rows, setRows] = useState<RecipeRowState[]>(
    recipe?.inputs.length
      ? recipe.inputs.map((line) => ({
          key: recipeRowKey(),
          productId: line.productId,
          quantityPerUnit: line.quantityPerUnit,
        }))
      : [{ key: recipeRowKey(), productId: "", quantityPerUnit: "" }],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({});
    start(async () => {
      const result = await saveRecipeAction(recipe?.id ?? null, {
        outputProductId,
        ...(nameBn ? { nameBn } : {}),
        ...(yieldPercent ? { expectedYieldPercent: yieldPercent } : {}),
        ...(notes ? { notes } : {}),
        inputs: rows
          .filter((row) => row.productId && row.quantityPerUnit)
          .map((row) => ({
            productId: row.productId,
            quantityPerUnit: row.quantityPerUnit,
          })),
      });
      setState(result);
      if (result.ok) onDone?.();
    });
  }

  const update = (key: string, patch: Partial<RecipeRowState>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const unitOf = (productId: string) =>
    products.find((product) => product.id === productId)?.unitSymbol ?? "";

  return (
    <form onSubmit={submit} className="space-y-4">
      <Feedback state={state} done="রেসিপি সংরক্ষিত হয়েছে" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>{bn.fields.outputProduct}</FieldLabel>
          <Select
            value={outputProductId}
            onChange={(event) => setOutputProductId(event.target.value)}
            required
          >
            <option value="">— নির্বাচন করুন —</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nameBn}
              </option>
            ))}
          </Select>
        </Field>

        <Field hint="খালি রাখলে উৎপাদিত পণ্যের নামেই চিনবেন">
          <FieldLabel>{bn.fields.recipe} নাম</FieldLabel>
          <Input value={nameBn} onChange={(event) => setNameBn(event.target.value)} />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">{bn.fields.inputProduct}</p>
            <p className="text-xs text-muted-foreground">
              এক ব্যাচে যত লাগে — দাম নয়, শুধু পরিমাণ
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: recipeRowKey(), productId: "", quantityPerUnit: "" },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            {bn.actions.addNew}
          </Button>
        </div>

        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <Field>
              <FieldLabel required>{bn.fields.product}</FieldLabel>
              <Select
                value={row.productId}
                onChange={(event) => update(row.key, { productId: event.target.value })}
              >
                <option value="">— নির্বাচন করুন —</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nameBn}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel required>
                {bn.fields.quantity}
                {row.productId ? ` (${unitOf(row.productId)})` : ""}
              </FieldLabel>
              <Input
                inputMode="decimal"
                value={row.quantityPerUnit}
                onChange={(event) => update(row.key, { quantityPerUnit: event.target.value })}
                placeholder="0"
              />
            </Field>

            <div className="flex items-end pb-1">
              <button
                type="button"
                aria-label={`কাঁচামাল ${index + 1} মুছুন`}
                disabled={rows.length === 1}
                onClick={() => setRows((c) => c.filter((item) => item.key !== row.key))}
                className="p-2 text-muted-foreground hover:text-debit disabled:opacity-40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field hint="৫০০ কেজি থেকে ৪৫০ কেজি পেলে ৯০">
          <FieldLabel>{bn.fields.yield} (%)</FieldLabel>
          <Input
            inputMode="decimal"
            value={yieldPercent}
            onChange={(event) => setYieldPercent(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{bn.fields.description}</FieldLabel>
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "সংরক্ষণ হচ্ছে…" : bn.actions.saveShort}
      </Button>
    </form>
  );
}

/** The add-panel wrapper, so a new recipe starts from a button like the rest. */
export function AddRecipePanel({ products }: { products: RecipeProduct[] }) {
  return (
    <AddPanel label="রেসিপি যোগ করুন">
      {(close) => <RecipeForm products={products} onDone={close} />}
    </AddPanel>
  );
}

export function DeactivateRecipeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`${name} বন্ধ করবেন? নতুন এন্ট্রিতে আর দেখাবে না।`)) return;
          start(async () => {
            const result = await deactivateRecipeAction(id);
            if (result.error) setError(result.error);
          });
        }}
        className="text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : "বন্ধ করুন"}
      </button>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}

/**
 * Retire, not delete.
 *
 * Every one of these is pointed at by history — a journal line, a product, an
 * old voucher — so removing the row would orphan the record that explains it.
 * The button says বন্ধ করুন for that reason, and the confirm exists because it
 * silently changes what the entry form offers.
 */
export function DeactivateButton({
  target,
  id,
  name,
  disabled,
  disabledReason,
}: {
  target: "wallet" | "unit" | "category" | "productCategory";
  id: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  if (disabled) {
    return (
      <span className="text-xs text-subtle-foreground" title={disabledReason}>
        {disabledReason}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`${name} বন্ধ করবেন? তালিকা থেকে সরে যাবে, হিসাব থাকবে।`)) return;
          start(async () => {
            const result = await deactivateAction(target, id);
            if (result.error) setError(result.error);
          });
        }}
        className="text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : "বন্ধ করুন"}
      </button>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}
