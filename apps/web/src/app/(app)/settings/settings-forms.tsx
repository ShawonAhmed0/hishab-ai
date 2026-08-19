"use client";

import * as React from "react";
import { useActionState, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import type { FinancialAccountKind } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import {
  createCategoryAction,
  createProductCategoryAction,
  createUnitAction,
  createWalletAction,
  deactivateAction,
  deactivateRecipeAction,
  saveRecipeAction,
  setOverridePinAction,
  updateCompanyAction,
  type SettingsState,
} from "./actions";
import type { CompanyProfile } from "@hishabai/core";

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
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateCompanyAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} done={t.settings.companySaved} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>{t.settings.companyName}</FieldLabel>
          <Input name="name" required defaultValue={company.name} />
        </Field>
        <Field hint={t.settings.companyNameHint}>
          <FieldLabel>{t.settings.bengaliName}</FieldLabel>
          <Input name="nameBn" defaultValue={company.nameBn ?? ""} />
        </Field>
        <Field>
          <FieldLabel>{t.settings.businessType}</FieldLabel>
          <Input name="businessType" defaultValue={company.businessType ?? ""} />
        </Field>
        <Field>
          <FieldLabel>{t.fields.phone}</FieldLabel>
          <Input name="phone" inputMode="tel" defaultValue={company.phone ?? ""} />
        </Field>
      </div>

      <Field>
        <FieldLabel>{t.fields.address}</FieldLabel>
        <Textarea name="address" rows={2} defaultValue={company.address ?? ""} />
      </Field>

      <Field hint={t.settings.fiscalYearHint}>
        <FieldLabel>{t.settings.fiscalYearMonth}</FieldLabel>
        <Select name="fiscalYearStartMonth" defaultValue={String(company.fiscalYearStartMonth)}>
          {t.months.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? t.settings.saving : t.actions.saveShort}
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
  const t = useT();
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
          className="-m-2 flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={t.actions.close}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {children(() => setOpen(false))}
    </div>
  );
}

export function WalletForm() {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createWalletAction,
    {},
  );
  const [kind, setKind] = useState<FinancialAccountKind>("bank");

  return (
    <AddPanel label={t.settings.addWallet}>
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done={t.settings.walletAdded} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>{t.settings.kindColumn}</FieldLabel>
              <Select
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as FinancialAccountKind)}
              >
                <option value="cash">{t.financialAccountKind.cash}</option>
                <option value="bank">{t.financialAccountKind.bank}</option>
                <option value="mfs">{t.financialAccountKind.mfs}</option>
              </Select>
            </Field>

            <Field>
              <FieldLabel required>{t.settings.nameColumn}</FieldLabel>
              <Input name="nameBn" required placeholder={t.settings.walletNamePlaceholder} />
            </Field>

            {kind === "bank" ? (
              <>
                <Field>
                  <FieldLabel>{t.settings.bankName}</FieldLabel>
                  <Input name="bankName" placeholder="Islami Bank" />
                </Field>
                <Field>
                  <FieldLabel>{t.settings.accountNumber}</FieldLabel>
                  <Input name="accountNumber" inputMode="numeric" />
                </Field>
              </>
            ) : null}

            {kind === "mfs" ? (
              <Field>
                <FieldLabel>{t.settings.provider}</FieldLabel>
                <Select name="mfsProvider" defaultValue="bkash">
                  {(["bkash", "nagad", "rocket", "upay", "other"] as const).map((provider) => (
                    <option key={provider} value={provider}>
                      {t.mfsProvider[provider]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field hint={t.settings.walletOpeningHint}>
              <FieldLabel>{t.fields.openingBalance}</FieldLabel>
              <Input name="openingBalance" inputMode="decimal" defaultValue="0" />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? t.settings.adding : t.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function UnitForm() {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createUnitAction,
    {},
  );

  return (
    <AddPanel label={t.settings.addUnit}>
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done={t.settings.unitAdded} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel required>{t.settings.nameColumn}</FieldLabel>
              <Input name="nameBn" required placeholder={t.settings.unitNamePlaceholder} />
            </Field>
            <Field>
              <FieldLabel required>{t.settings.unitAbbreviation}</FieldLabel>
              <Input name="symbol" required placeholder="ctn" />
            </Field>
            <Field hint={t.settings.decimalHint}>
              <FieldLabel>{t.settings.decimalPlaces}</FieldLabel>
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
            {pending ? t.settings.adding : t.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function CategoryForm() {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createCategoryAction,
    {},
  );

  return (
    <AddPanel label={t.settings.addCategory}>
      {() => (
        <form action={action} className="space-y-4">
          <Feedback state={state} done={t.settings.categoryAdded} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>{t.settings.incomeOrExpense}</FieldLabel>
              <Select name="type" defaultValue="expense">
                <option value="expense">{t.transactionType.expense}</option>
                <option value="income">{t.transactionType.income}</option>
              </Select>
            </Field>
            <Field hint={t.settings.categoryHint}>
              <FieldLabel required>{t.settings.categoryName}</FieldLabel>
              <Input name="nameBn" required placeholder={t.settings.categoryNamePlaceholder} />
            </Field>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? t.settings.adding : t.actions.addNew}
          </Button>
        </form>
      )}
    </AddPanel>
  );
}

export function ProductCategoryForm() {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createProductCategoryAction,
    {},
  );

  return (
    <AddPanel label={t.settings.addProductCategory}>
      {() => (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <Field className="min-w-[14rem] flex-1">
            <FieldLabel required>{t.settings.nameColumn}</FieldLabel>
            <Input name="nameBn" required placeholder={t.settings.productCategoryPlaceholder} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t.settings.adding : t.actions.addNew}
          </Button>
          <div className="w-full">
            <Feedback state={state} done={t.settings.productCategoryAdded} />
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
  const t = useT();
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
      <Feedback state={state} done={t.settings.recipeSaved} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>{t.fields.outputProduct}</FieldLabel>
          <Select
            value={outputProductId}
            onChange={(event) => setOutputProductId(event.target.value)}
            required
          >
            <option value="">{t.settings.choosePrompt}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nameBn}
              </option>
            ))}
          </Select>
        </Field>

        <Field hint={t.settings.recipeNameHint}>
          <FieldLabel>{t.settings.recipeNameLabel(t.fields.recipe)}</FieldLabel>
          <Input value={nameBn} onChange={(event) => setNameBn(event.target.value)} />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">{t.fields.inputProduct}</p>
            <p className="text-xs text-muted-foreground">
              {t.settings.recipeInputsHint}
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
            {t.actions.addNew}
          </Button>
        </div>

        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <Field>
              <FieldLabel required>{t.fields.product}</FieldLabel>
              <Select
                value={row.productId}
                onChange={(event) => update(row.key, { productId: event.target.value })}
              >
                <option value="">{t.settings.choosePrompt}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nameBn}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel required>
                {t.fields.quantity}
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
                aria-label={t.settings.removeInput(String(index + 1))}
                disabled={rows.length === 1}
                onClick={() => setRows((c) => c.filter((item) => item.key !== row.key))}
                className="flex size-11 items-center justify-center text-muted-foreground hover:text-debit disabled:opacity-40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field hint={t.settings.yieldHint}>
          <FieldLabel>{t.fields.yield} (%)</FieldLabel>
          <Input
            inputMode="decimal"
            value={yieldPercent}
            onChange={(event) => setYieldPercent(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t.fields.description}</FieldLabel>
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t.settings.saving : t.actions.saveShort}
      </Button>
    </form>
  );
}

/** The add-panel wrapper, so a new recipe starts from a button like the rest. */
export function AddRecipePanel({ products }: { products: RecipeProduct[] }) {
  const t = useT();

  return (
    <AddPanel label={t.settings.addRecipe}>
      {(close) => <RecipeForm products={products} onDone={close} />}
    </AddPanel>
  );
}

export function DeactivateRecipeButton({ id, name }: { id: string; name: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t.settings.confirmDisableWallet(name))) return;
          start(async () => {
            const result = await deactivateRecipeAction(id);
            if (result.error) setError(result.error);
          });
        }}
        className="-mx-2 min-h-11 px-2 text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : t.actions.close}
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
  const t = useT();
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
          if (!window.confirm(t.settings.confirmDisableCategory(name))) return;
          start(async () => {
            const result = await deactivateAction(target, id);
            if (result.error) setError(result.error);
          });
        }}
        className="-mx-2 min-h-11 px-2 text-sm text-muted-foreground hover:text-debit disabled:opacity-50"
      >
        {pending ? "…" : t.actions.close}
      </button>
      {error ? <span className="text-xs text-debit">{error}</span> : null}
    </span>
  );
}

/**
 * The override PIN — spec R1.2.
 *
 * Two fields and a boolean. `isSet` is the whole of what the server will say
 * about an existing PIN: there is no endpoint that returns it, and nothing on
 * this page has ever seen it.
 */
export function OverridePinForm({ isSet }: { isSet: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    setOverridePinAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} done={t.override.saved} />

      <p className="text-sm text-muted-foreground">{t.override.setDescription}</p>
      <p className="text-sm font-medium">{isSet ? t.override.isSet : t.override.notSet}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field hint={t.override.pinRule}>
          <FieldLabel required>{t.override.newPin}</FieldLabel>
          <Input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field>
          <FieldLabel required>{t.override.confirmPin}</FieldLabel>
          <Input
            name="confirmPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
          />
        </Field>
      </div>

      <Button type="submit" loading={pending}>
        {t.override.savePin}
      </Button>
    </form>
  );
}
