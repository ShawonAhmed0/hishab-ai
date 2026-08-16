"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PRODUCT_KINDS, bn, type ProductKind } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import {
  createPartyAction,
  createProductAction,
  type CreateResult,
  type CreatedParty,
  type CreatedProduct,
} from "@/app/(app)/master-data-actions";

export interface UnitChoice {
  id: string;
  nameBn: string;
  symbol: string;
}
export interface CategoryChoice {
  id: string;
  nameBn: string;
}

/**
 * The panel both the list pages and the entry form open.
 *
 * On a list page it is a disclosure; inside নতুন এন্ট্রি it is a panel that
 * appears next to the dropdown that just came up empty. Same form either way —
 * a customer added mid-invoice is not a lesser customer.
 */
function Disclosure({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

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
          aria-label={bn.actions.close}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {children(() => setOpen(false))}
    </div>
  );
}

/**
 * Not a `<form>`, deliberately.
 *
 * These panels open *inside* নতুন এন্ট্রি, which is itself a form, and a
 * nested form is invalid HTML — the submit resolves to the outer one, so
 * "add this customer" quietly tried to post the half-filled invoice around it.
 * A div with an explicit submit button behaves the same everywhere; Enter is
 * wired up by hand because that is the one thing a div does not give you.
 */
function FieldGroup({
  onSubmit,
  children,
}: {
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        if (event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </div>
  );
}

function useCreateResult<T>() {
  const [result, setResult] = React.useState<CreateResult<T> | null>(null);
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const summary =
    result && !result.ok
      ? Object.entries(fieldErrors).map(([fieldId, message]) => ({ fieldId, message }))
      : [];
  return { result, setResult, fieldErrors, summary };
}

// ---------------------------------------------------------------------------
// পক্ষ
// ---------------------------------------------------------------------------

export function PartyFields({
  defaultType,
  onCreated,
  onCancel,
}: {
  defaultType: "customer" | "vendor";
  onCreated?: (party: CreatedParty) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const { result, setResult, fieldErrors, summary } = useCreateResult<CreatedParty>();

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"customer" | "vendor" | "both">(defaultType);
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [openingBalance, setOpeningBalance] = React.useState("");
  const [creditLimit, setCreditLimit] = React.useState("");

  function submit() {
    setResult(null);
    start(async () => {
      const outcome = await createPartyAction({
        name,
        type,
        ...(phone ? { phone } : {}),
        ...(address ? { address } : {}),
        ...(creditLimit ? { creditLimit } : {}),
        openingBalance: openingBalance || "0",
      });
      setResult(outcome);
      if (outcome.ok) {
        onCreated?.(outcome.created);
        onCancel?.();
        router.refresh();
      }
    });
  }

  return (
    <FieldGroup onSubmit={submit}>
      {result && !result.ok ? <ErrorSummary title={result.error} errors={summary} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={fieldErrors["name"]}>
          <FieldLabel required>{bn.fields.name}</FieldLabel>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="মায়ের দোয়া ট্রেডার্স"
            autoFocus
            required
          />
        </Field>

        <Field>
          <FieldLabel required>ধরন</FieldLabel>
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            <option value="customer">{bn.fields.customer}</option>
            <option value="vendor">{bn.fields.vendor}</option>
            <option value="both">{bn.fields.party}</option>
          </Select>
        </Field>

        <Field error={fieldErrors["phone"]}>
          <FieldLabel>{bn.fields.phone}</FieldLabel>
          <Input
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="01812345678"
          />
        </Field>

        <Field
          error={fieldErrors["openingBalance"]}
          hint={
            type === "vendor"
              ? "আগে থেকে যত টাকা পাওনা আছে"
              : "আগে থেকে যত টাকা বকেয়া আছে"
          }
        >
          <FieldLabel>{bn.fields.openingBalance}</FieldLabel>
          <Input
            inputMode="decimal"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            placeholder="0"
          />
        </Field>

        {type !== "vendor" ? (
          <Field
            error={fieldErrors["creditLimit"]}
            hint="এর বেশি বাকি পড়লে বিক্রির সময় সতর্ক করা হবে — বিক্রি আটকাবে না"
          >
            <FieldLabel>{bn.fields.creditLimit}</FieldLabel>
            <Input
              inputMode="decimal"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
              placeholder="0"
            />
          </Field>
        ) : null}
      </div>

      <Field>
        <FieldLabel>{bn.fields.address}</FieldLabel>
        <Textarea
          rows={2}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="button" loading={pending} onClick={submit}>
          {bn.actions.saveShort}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {bn.actions.close}
          </Button>
        ) : null}
      </div>
    </FieldGroup>
  );
}

export function AddPartyPanel({ type }: { type: "customer" | "vendor" }) {
  return (
    <Disclosure label={type === "vendor" ? "নতুন ভেন্ডর" : "নতুন কাস্টমার"}>
      {(close) => <PartyFields defaultType={type} onCancel={close} />}
    </Disclosure>
  );
}

// ---------------------------------------------------------------------------
// পণ্য
// ---------------------------------------------------------------------------

export function ProductFields({
  units,
  categories,
  onCreated,
  onCancel,
}: {
  units: UnitChoice[];
  categories: CategoryChoice[];
  onCreated?: (product: CreatedProduct) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const { result, setResult, fieldErrors, summary } = useCreateResult<CreatedProduct>();

  const [nameBn, setNameBn] = React.useState("");
  const [kind, setKind] = React.useState<ProductKind>("finished_good");
  const [unitId, setUnitId] = React.useState(units[0]?.id ?? "");
  const [categoryId, setCategoryId] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [purchasePrice, setPurchasePrice] = React.useState("");
  const [salePrice, setSalePrice] = React.useState("");
  const [minStockLevel, setMinStockLevel] = React.useState("");
  const [openingQuantity, setOpeningQuantity] = React.useState("");
  const [openingRate, setOpeningRate] = React.useState("");

  const unit = units.find((option) => option.id === unitId);

  function submit() {
    setResult(null);
    start(async () => {
      const outcome = await createProductAction(
        {
          nameBn,
          kind,
          unitId,
          ...(categoryId ? { categoryId } : {}),
          ...(sku ? { sku } : {}),
          purchasePrice: purchasePrice || "0",
          salePrice: salePrice || "0",
          minStockLevel: minStockLevel || "0",
          openingQuantity: openingQuantity || "0",
          openingRate: openingRate || purchasePrice || "0",
        },
        unit?.symbol ?? "",
      );
      setResult(outcome);
      if (outcome.ok) {
        onCreated?.(outcome.created);
        onCancel?.();
        router.refresh();
      }
    });
  }

  return (
    <FieldGroup onSubmit={submit}>
      {result && !result.ok ? <ErrorSummary title={result.error} errors={summary} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={fieldErrors["nameBn"]}>
          <FieldLabel required>{bn.fields.product}</FieldLabel>
          <Input
            value={nameBn}
            onChange={(event) => setNameBn(event.target.value)}
            placeholder="অফসেট পেপার"
            autoFocus
            required
          />
        </Field>

        <Field>
          <FieldLabel required>ধরন</FieldLabel>
          <Select value={kind} onChange={(event) => setKind(event.target.value as ProductKind)}>
            {PRODUCT_KINDS.map((option) => (
              <option key={option} value={option}>
                {bn.productKind[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Field error={fieldErrors["unitId"]} hint="কেজি, পিস, রোল — সেটিংস থেকে যোগ করা যায়">
          <FieldLabel required>{bn.fields.unit}</FieldLabel>
          <Select value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
            <option value="">— নির্বাচন করুন —</option>
            {units.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameBn} ({option.symbol})
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel>ক্যাটাগরি</FieldLabel>
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">— নেই —</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameBn}
              </option>
            ))}
          </Select>
        </Field>

        <Field error={fieldErrors["purchasePrice"]}>
          <FieldLabel>{bn.fields.purchasePrice}</FieldLabel>
          <Input
            inputMode="decimal"
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            placeholder="0"
          />
        </Field>

        <Field error={fieldErrors["salePrice"]}>
          <FieldLabel>{bn.fields.salePrice}</FieldLabel>
          <Input
            inputMode="decimal"
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            placeholder="0"
          />
        </Field>

        <Field hint="এর নিচে নামলে বিজ্ঞপ্তি পাবেন">
          <FieldLabel>{bn.fields.minStock}</FieldLabel>
          <Input
            inputMode="decimal"
            value={minStockLevel}
            onChange={(event) => setMinStockLevel(event.target.value)}
            placeholder="0"
          />
        </Field>

        <Field
          error={fieldErrors["openingQuantity"]}
          hint={
            unit
              ? `আজ গুদামে যত ${unit.symbol} আছে — খাতায় প্রারম্ভিক স্টক হিসেবে বসবে`
              : undefined
          }
        >
          <FieldLabel>প্রারম্ভিক স্টক</FieldLabel>
          <Input
            inputMode="decimal"
            value={openingQuantity}
            onChange={(event) => setOpeningQuantity(event.target.value)}
            placeholder="0"
          />
        </Field>

        {openingQuantity ? (
          <Field hint="খালি রাখলে ক্রয় মূল্য ধরা হবে">
            <FieldLabel>প্রারম্ভিক স্টকের দর</FieldLabel>
            <Input
              inputMode="decimal"
              value={openingRate}
              onChange={(event) => setOpeningRate(event.target.value)}
              placeholder={purchasePrice || "0"}
            />
          </Field>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button type="button" loading={pending} onClick={submit}>
          {bn.actions.saveShort}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {bn.actions.close}
          </Button>
        ) : null}
      </div>
    </FieldGroup>
  );
}

export function AddProductPanel({
  units,
  categories,
}: {
  units: UnitChoice[];
  categories: CategoryChoice[];
}) {
  return (
    <Disclosure label="নতুন পণ্য">
      {(close) => <ProductFields units={units} categories={categories} onCancel={close} />}
    </Disclosure>
  );
}
