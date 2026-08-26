"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Camera,
  Mic,
  Package,
  Plus,
  ShoppingCart,
  Trash2,
  Wallet,
  Wrench,
  ClipboardList,
  Undo2,
  FileText,
  Printer,
} from "lucide-react";
import {
  ZERO,
  ZERO_QTY,
  absMoney,
  addMoney,
  formatMoney,
  formatQty,
  money,
  moneyFromDb,
  multiplyRate,
  percentOfMoney,
  qty,
  qtyFromDb,
  scaleQty,
  subMoney,
  subQty,
  transactionInputSchema,
  validationMessage,
  type Dictionary,
  type DiscountType,
  type Money,
  type OverridableRule,
  type Qty,
  type TransactionType,
} from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorSummary, Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyText } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime, todayIso } from "@/lib/utils";
import {
  PartyFields,
  ProductFields,
  type CategoryChoice,
} from "@/components/master-data/create-forms";
import { Dialog } from "@/components/ui/dialog";
import { deriveGate } from "./gate";
import { createEntryAction, type EntryResult, type EntrySuccess } from "./actions";
import { VoiceScanPanel, type ParsedDraft } from "./voice-scan";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PartyOption {
  id: string;
  name: string;
  type: string;
  receivable: string;
  payable: string;
}
export interface ProductOption {
  id: string;
  nameBn: string;
  kind: string;
  unitId: string;
  unitSymbol: string;
  salePrice: string;
  purchasePrice: string;
  quantity: string;
}
export interface UnitOption {
  id: string;
  nameBn: string;
  symbol: string;
}
export interface WalletOption {
  id: string;
  nameBn: string;
  kind: string;
  isDefault: boolean;
}
export interface CategoryOption {
  id: string;
  nameBn: string;
  code: string;
}
export interface AccountOption {
  id: string;
  nameBn: string;
  code: string;
  type: string;
}
export interface RecipeOption {
  id: string;
  nameBn: string | null;
  outputProductId: string;
  expectedYieldPercent: string | null;
  inputs: { productId: string; unitId: string; quantityPerUnit: string }[];
}

interface Props {
  parties: PartyOption[];
  products: ProductOption[];
  units: UnitOption[];
  wallets: WalletOption[];
  incomeCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
  postingAccounts: AccountOption[];
  recipes: RecipeOption[];
  productCategories: CategoryChoice[];
  /** An operator may post entries but not create the things they name. */
  canManageParties: boolean;
  canManageProducts: boolean;
  /** R4.2 — ask before every save. Off unless the company turned it on. */
  confirmEveryEntry: boolean;
}

// ---------------------------------------------------------------------------
// Type picker
// ---------------------------------------------------------------------------

const PRIMARY_TYPES: TransactionType[] = [
  "sale",
  "purchase",
  "income",
  "expense",
  "customer_payment",
  "vendor_payment",
];

const MORE_TYPES: TransactionType[] = [
  "production",
  "stock_adjustment",
  "sale_return",
  "purchase_return",
  "other",
];

const TYPE_ICON: Record<TransactionType, React.ComponentType<{ className?: string }>> = {
  sale: ShoppingCart,
  purchase: Package,
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  customer_payment: Wallet,
  vendor_payment: Wallet,
  production: Wrench,
  stock_adjustment: ClipboardList,
  sale_return: Undo2,
  purchase_return: Undo2,
  other: FileText,
};

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

interface LineState {
  key: string;
  productId: string;
  unitId: string;
  quantity: string;
  rate: string;
  pieces: string;
}

interface PaymentState {
  key: string;
  financialAccountId: string;
  amount: string;
  handledByName: string;
}

/** উৎপাদন and স্টক সমন্বয় never quote a rate — the engine costs them itself. */
interface SimpleLineState {
  key: string;
  productId: string;
  quantity: string;
  note: string;
}

/** One side of an অন্যান্য entry. Which side it is comes from the list it is in. */
interface JournalRowState {
  key: string;
  accountId: string;
  amount: string;
  narration: string;
}

const newKey = () => Math.random().toString(36).slice(2);
const emptyLine = (): LineState => ({
  key: newKey(),
  productId: "",
  unitId: "",
  quantity: "",
  rate: "",
  pieces: "",
});
const emptySimple = (): SimpleLineState => ({
  key: newKey(),
  productId: "",
  quantity: "",
  note: "",
});
const emptyJournalRow = (): JournalRowState => ({
  key: newKey(),
  accountId: "",
  amount: "",
  narration: "",
});

/** The database hands quantities over at full 6dp; nobody wants to read that. */
const stockHint = (product: ProductOption, t: Dictionary) =>
  t.entry.stockIs(formatQty(qtyFromDb(product.quantity), { unit: product.unitSymbol }));

/** First one wins, so a locally added row loses to the server's copy of it. */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/** Lines and adjustments only appear for the types that actually use them. */
const NEEDS_LINES: TransactionType[] = [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
];
const NEEDS_PARTY: TransactionType[] = [
  "sale",
  "purchase",
  "customer_payment",
  "vendor_payment",
  "sale_return",
  "purchase_return",
];
const NEEDS_CATEGORY: TransactionType[] = ["income", "expense"];
/** One row of the cost list — spec R3.4. */
interface CostState {
  key: string;
  /** The খাত it posts to. Empty until the user picks one. */
  accountId: string;
  /** What they called it, when the খাত alone does not say enough. */
  label: string;
  amount: string;
}

function emptyCost(): CostState {
  return { key: crypto.randomUUID(), accountId: "", label: "", amount: "" };
}

const NEEDS_TRADE_COSTS: TransactionType[] = ["sale", "purchase"];
const VENDOR_SIDE: TransactionType[] = ["purchase", "vendor_payment", "purchase_return"];

/** These three settle within themselves — there is no party and no bill. */
const NO_PARTY_TOTALS: TransactionType[] = ["production", "stock_adjustment", "other"];

// ---------------------------------------------------------------------------
// Row lists
// ---------------------------------------------------------------------------

interface StockRowsProps {
  title: string;
  hint?: string;
  rows: SimpleLineState[];
  setRows: React.Dispatch<React.SetStateAction<SimpleLineState[]>>;
  products: ProductOption[];
  quantityLabel: string;
  notePlaceholder?: string;
  /** Field path prefix the server uses, so inline errors land on the right row. */
  errorPrefix: string;
  fieldErrors: Record<string, string>;
  /** Rendered under the quantity box — stock on hand, or the counted delta. */
  quantityHint?: (row: SimpleLineState, product: ProductOption | undefined) => string | undefined;
  minRows?: number;
}

function StockRows({
  title,
  hint,
  rows,
  setRows,
  products,
  quantityLabel,
  notePlaceholder,
  errorPrefix,
  fieldErrors,
  quantityHint,
  minRows = 1,
}: StockRowsProps) {
  const t = useT();
  const update = (key: string, patch: Partial<SimpleLineState>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{title}</h3>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRows((c) => [...c, emptySimple()])}>
          <Plus className="size-4" aria-hidden />
          {t.actions.addNew}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {t.entry.nothingAdded}
        </p>
      ) : null}

      {rows.map((row, index) => {
        const product = products.find((p) => p.id === row.productId);
        return (
          <div
            key={row.key}
            className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1.4fr_auto]"
          >
            <Field
              fieldId={`${errorPrefix}.${index}.productId`}
              error={fieldErrors[`${errorPrefix}.${index}.productId`]}
            >
              <FieldLabel required>{t.fields.product}</FieldLabel>
              <Select
                value={row.productId}
                onChange={(e) => update(row.key, { productId: e.target.value })}
              >
                <option value="">{t.entry.choosePrompt}</option>
                {products.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.nameBn}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              // স্টক সমন্বয় calls it countedQuantity and everything else calls
              // it quantity; one box, so whichever the server names is the one
              // its link has to land on.
              fieldId={
                fieldErrors[`${errorPrefix}.${index}.countedQuantity`]
                  ? `${errorPrefix}.${index}.countedQuantity`
                  : `${errorPrefix}.${index}.quantity`
              }
              error={
                fieldErrors[`${errorPrefix}.${index}.quantity`] ??
                fieldErrors[`${errorPrefix}.${index}.countedQuantity`]
              }
              hint={quantityHint?.(row, product)}
            >
              <FieldLabel required>
                {quantityLabel}
                {product ? ` (${product.unitSymbol})` : ""}
              </FieldLabel>
              <Input
                numeric
                value={row.quantity}
                onChange={(e) => update(row.key, { quantity: e.target.value })}
                placeholder="0"
              />
            </Field>

            <Field>
              <FieldLabel>{t.fields.description}</FieldLabel>
              <Input
                value={row.note}
                onChange={(e) => update(row.key, { note: e.target.value })}
                placeholder={notePlaceholder ?? ""}
              />
            </Field>

            <div className="flex items-end pb-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.entry.removeTitledLine(title, String(index + 1))}
                disabled={rows.length <= minRows}
                onClick={() => setRows((c) => c.filter((item) => item.key !== row.key))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface JournalRowsProps {
  title: string;
  hint: string;
  rows: JournalRowState[];
  setRows: React.Dispatch<React.SetStateAction<JournalRowState[]>>;
  accounts: AccountOption[];
  total: Money;
}

function JournalRows({ title, hint, rows, setRows, accounts, total }: JournalRowsProps) {
  const t = useT();
  const update = (key: string, patch: Partial<JournalRowState>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRows((c) => [...c, emptyJournalRow()])}>
          <Plus className="size-4" aria-hidden />
          {t.actions.addNew}
        </Button>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1.4fr_auto]"
        >
          <Field>
            <FieldLabel required>{t.entry.account}</FieldLabel>
            <Select
              value={row.accountId}
              onChange={(e) => update(row.key, { accountId: e.target.value })}
            >
              <option value="">{t.entry.choosePrompt}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} — {account.nameBn}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <FieldLabel required>{t.fields.amount}</FieldLabel>
            <Input
              numeric
              value={row.amount}
              onChange={(e) => update(row.key, { amount: e.target.value })}
              placeholder="0"
            />
          </Field>

          <Field>
            <FieldLabel>{t.fields.description}</FieldLabel>
            <Input
              value={row.narration}
              onChange={(e) => update(row.key, { narration: e.target.value })}
            />
          </Field>

          <div className="flex items-end pb-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.entry.removeTitledLine(title, String(index + 1))}
              disabled={rows.length === 1}
              onClick={() => setRows((c) => c.filter((item) => item.key !== row.key))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ))}

      <p className="text-right text-sm text-muted-foreground">
        {t.entry.totalIs} <MoneyText value={total} size="sm" />
      </p>
    </div>
  );
}

export function EntryForm({
  parties: loadedParties,
  products: loadedProducts,
  units,
  wallets,
  incomeCategories,
  expenseCategories,
  postingAccounts,
  recipes,
  productCategories,
  canManageParties,
  canManageProducts,
  confirmEveryEntry,
}: Props) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];

  // Master data created without leaving the form.
  const [extraParties, setExtraParties] = React.useState<PartyOption[]>([]);
  const [extraProducts, setExtraProducts] = React.useState<ProductOption[]>([]);
  const [addingParty, setAddingParty] = React.useState(false);
  const [addingProduct, setAddingProduct] = React.useState(false);

  // A row created mid-entry is in the dropdown before the server round trip
  // that will eventually deliver it in `loadedParties` anyway; deduped by id so
  // the refresh landing underneath does not double it.
  const parties = React.useMemo(
    () => dedupeById([...loadedParties, ...extraParties]),
    [loadedParties, extraParties],
  );
  const products = React.useMemo(
    () => dedupeById([...loadedProducts, ...extraProducts]),
    [loadedProducts, extraProducts],
  );

  const [type, setType] = React.useState<TransactionType>("sale");
  const [showMore, setShowMore] = React.useState(false);
  const [date, setDate] = React.useState(todayIso());
  const [partyId, setPartyId] = React.useState("");
  const [categoryAccountId, setCategoryAccountId] = React.useState("");
  const [lines, setLines] = React.useState<LineState[]>([emptyLine()]);
  const [transportCost, setTransportCost] = React.useState("");
  const [laborCost, setLaborCost] = React.useState("");
  /**
   * R3.4. Every cost that is not freight or labour, each named and each
   * posting where it is named. A trade rarely has exactly one, and folding
   * three into a single "অন্যান্য" figure puts a number on the voucher that
   * means nothing to the person holding it.
   */
  const [otherCosts, setOtherCosts] = React.useState<CostState[]>([]);
  /**
   * উৎপাদনের অন্যান্য খরচ, which is a different thing and stays a single
   * figure: conversion cost is what turns inputs into outputs, and the engine
   * requires it to be matched by real payments. It is not a cost of *buying*
   * anything, so it does not belong in the list above.
   */
  const [productionOtherCost, setProductionOtherCost] = React.useState("");
  // R3.4: what the "other cost" actually was. Unset keeps the old posting.
  const [discount, setDiscount] = React.useState("");
  const [discountType, setDiscountType] = React.useState<DiscountType>("amount");
  const [payments, setPayments] = React.useState<PaymentState[]>([
    {
      key: newKey(),
      financialAccountId: defaultWallet?.id ?? "",
      amount: "",
      handledByName: "",
    },
  ]);
  const [memoNo, setMemoNo] = React.useState("");
  // R4.3 — free text, and often not a user of this app: a driver, a delivery boy.
  const [giverName, setGiverName] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [source, setSource] = React.useState<"manual" | "voice" | "scan">("manual");

  // উৎপাদন
  const [recipeId, setRecipeId] = React.useState("");
  const [batchCount, setBatchCount] = React.useState("1");
  const [prodInputs, setProdInputs] = React.useState<SimpleLineState[]>([emptySimple()]);
  const [prodOutputs, setProdOutputs] = React.useState<SimpleLineState[]>([emptySimple()]);
  const [wastage, setWastage] = React.useState<SimpleLineState[]>([]);

  // স্টক সমন্বয়
  const [adjustments, setAdjustments] = React.useState<SimpleLineState[]>([emptySimple()]);

  // অন্যান্য — two plain lists instead of a Dr/Cr grid.
  const [sources, setSources] = React.useState<JournalRowState[]>([emptyJournalRow()]);
  const [destinations, setDestinations] = React.useState<JournalRowState[]>([
    emptyJournalRow(),
  ]);

  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<EntryResult | null>(null);

  // The override — spec R1.2. The payload is held rather than rebuilt so the
  // retry posts exactly what the server already refused, and the PIN is held
  // only for as long as the dialog is open.
  // R4.2. One gate for every "are you sure?": the payload waiting on an
  // answer, and the question itself derived from the server's reply. Three
  // separate dialogs is how the wording and the dismiss behaviour drift apart.
  const [pendingPayload, setPendingPayload] = React.useState<unknown>(null);
  // The one question that is asked before the server sees anything: R4.2's
  // final confirmation, off unless the company turned it on.
  const [askingFinal, setAskingFinal] = React.useState(false);
  const [pin, setPin] = React.useState("");
  // Every rule the person has been shown and agreed to on this entry. Sent
  // with the PIN so the server relaxes those and nothing else — a rule they
  // have not seen comes back as a fresh refusal and a fresh dialog.
  const [overrideRules, setOverrideRules] = React.useState<OverridableRule[]>([]);
  // R4.4 — the entry that just saved, so the success dialog can offer its receipt.
  const [saved, setSaved] = React.useState<EntrySuccess | null>(null);
  // Which questions this attempt has already answered, so the next refusal is
  // a fresh question rather than the same one again.
  const [answered, setAnswered] = React.useState<{
    duplicate?: boolean;
    unusual?: boolean;
  }>({});


  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  // --- derived, for the preview only. The server recomputes all of this. ----
  const subtotal = React.useMemo<Money>(() => {
    if (!NEEDS_LINES.includes(type)) return ZERO;
    return lines.reduce<Money>(
      (total, line) =>
        addMoney(total, multiplyRate(qty(line.quantity || "0"), money(line.rate || "0"))),
      ZERO,
    );
  }, [lines, type]);

  const charges = React.useMemo<Money>(
    () =>
      NEEDS_TRADE_COSTS.includes(type)
        ? addMoney(
            money(transportCost || "0"),
            money(laborCost || "0"),
            otherCosts.reduce<Money>((sum, row) => addMoney(sum, money(row.amount || "0")), ZERO),
          )
        : ZERO,
    [type, transportCost, laborCost, otherCosts],
  );

  const paidTotal = React.useMemo<Money>(
    () => payments.reduce<Money>((total, p) => addMoney(total, money(p.amount || "0")), ZERO),
    [payments],
  );

  // Preview only — the server resolves the percentage against its own subtotal
  // and discards whatever this worked out to.
  const discountAmount = React.useMemo<Money>(() => {
    const value = money(discount || "0");
    return discountType === "percent" ? percentOfMoney(subtotal, value) : value;
  }, [discount, discountType, subtotal]);

  const total = React.useMemo<Money>(() => {
    if (NEEDS_CATEGORY.includes(type) || type === "customer_payment" || type === "vendor_payment") {
      return paidTotal;
    }
    return subMoney(addMoney(subtotal, charges), discountAmount);
  }, [type, subtotal, charges, discountAmount, paidTotal]);

  const due = subMoney(total, paidTotal);

  const productOf = React.useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  );

  /** Conversion cost the engine insists is matched by real payments. */
  const conversionCost = React.useMemo<Money>(
    () => addMoney(money(laborCost || "0"), money(productionOtherCost || "0")),
    [laborCost, productionOtherCost],
  );

  const sourceTotal = React.useMemo<Money>(
    () => sources.reduce<Money>((sum, row) => addMoney(sum, money(row.amount || "0")), ZERO),
    [sources],
  );
  const destinationTotal = React.useMemo<Money>(
    () =>
      destinations.reduce<Money>((sum, row) => addMoney(sum, money(row.amount || "0")), ZERO),
    [destinations],
  );
  const journalDifference = subMoney(destinationTotal, sourceTotal);

  /** অপচয় is only meaningful for something the batch actually consumed. */
  const inputProducts = React.useMemo(
    () =>
      prodInputs
        .map((row) => productOf(row.productId))
        .filter((product): product is ProductOption => product !== undefined),
    [prodInputs, productOf],
  );

  const selectedParty = parties.find((p) => p.id === partyId);
  const previousDue = selectedParty
    ? moneyFromDb(VENDOR_SIDE.includes(type) ? selectedParty.payable : selectedParty.receivable)
    : ZERO;

  // --- behaviour -----------------------------------------------------------

  function changeType(next: TransactionType) {
    setType(next);
    setResult(null);
    setPartyId("");
    setCategoryAccountId("");
    setLines([emptyLine()]);
    setPayments([
      { key: newKey(), financialAccountId: defaultWallet?.id ?? "", amount: "", handledByName: "" },
    ]);
    setTransportCost("");
    setLaborCost("");
    setOtherCosts([]);
    setProductionOtherCost("");
    setGiverName("");
    setRecipientName("");
    setDiscount("");
    setDiscountType("amount");
    setSource("manual");
    setRecipeId("");
    setBatchCount("1");
    setProdInputs([emptySimple()]);
    setProdOutputs([emptySimple()]);
    setWastage([]);
    setAdjustments([emptySimple()]);
    setSources([emptyJournalRow()]);
    setDestinations([emptyJournalRow()]);
  }

  /**
   * A recipe is a starting point, not a lock: it fills the raw materials for
   * the batch size asked for and then gets out of the way, so an operator who
   * used a little more of something can still say so.
   */
  function applyRecipe(nextRecipeId: string, batches: string) {
    setRecipeId(nextRecipeId);
    const recipe = recipes.find((r) => r.id === nextRecipeId);
    if (!recipe) return;

    const multiplier = qty(batches || "0");
    setProdInputs(
      recipe.inputs.map((line) => ({
        key: newKey(),
        productId: line.productId,
        quantity: formatQty(scaleQty(qty(line.quantityPerUnit), multiplier)),
        note: "",
      })),
    );
    setProdOutputs([
      {
        key: newKey(),
        productId: recipe.outputProductId,
        quantity: batches || "",
        note: "",
      },
    ]);
    setWastage([]);
  }

  function updateCost(key: string, patch: Partial<CostState>) {
    setOtherCosts((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        // Picking a product fills in its unit and the price it usually goes
        // out at — still editable, just one fewer thing to type.
        if (patch.productId) {
          const product = products.find((p) => p.id === patch.productId);
          if (product) {
            next.unitId = product.unitId;
            if (!line.rate) {
              next.rate =
                type === "purchase" || type === "purchase_return"
                  ? product.purchasePrice
                  : product.salePrice;
            }
          }
        }
        return next;
      }),
    );
  }

  /** Voice and scan populate the form and stop. Nothing auto-submits. */
  function applyDraft(draft: ParsedDraft) {
    if (draft.type) setType(draft.type);
    if (draft.date) setDate(draft.date);
    if (draft.partyId) setPartyId(draft.partyId);
    if (draft.memoNo) setMemoNo(draft.memoNo);
    if (draft.description) setDescription(draft.description);
    if (draft.lines?.length) {
      setLines(
        draft.lines.map((line) => ({
          key: newKey(),
          productId: line.productId ?? "",
          unitId: line.unitId ?? "",
          quantity: line.quantity ?? "",
          rate: line.rate ?? "",
          pieces: "",
        })),
      );
    }
    if (draft.paidAmount) {
      setPayments([
        {
          key: newKey(),
          financialAccountId: defaultWallet?.id ?? "",
          amount: draft.paidAmount,
          handledByName: "",
        },
      ]);
    }
    setSource(draft.source);
    setResult(null);
  }

  function buildPayload(): Record<string, unknown> {
    const base = {
      date,
      source,
      attachmentIds: [],
      ...(memoNo ? { memoNo } : {}),
      ...(description ? { description } : {}),
      ...(giverName ? { giverName } : {}),
      ...(recipientName ? { recipientName } : {}),
    };

    const activePayments = payments
      .filter((p) => p.financialAccountId && money(p.amount || "0") > 0n)
      .map((p) => ({
        financialAccountId: p.financialAccountId,
        amount: p.amount,
        ...(p.handledByName ? { handledByName: p.handledByName } : {}),
      }));

    const activeLines = lines
      .filter((line) => line.productId && line.quantity)
      .map((line) => ({
        productId: line.productId,
        unitId: line.unitId,
        quantity: line.quantity,
        rate: line.rate || "0",
        ...(line.pieces ? { pieces: line.pieces } : {}),
      }));

    // The unit is never asked for: it is whatever the product is measured in.
    const stockRows = (rows: SimpleLineState[], noteKey: "description" | "reason") =>
      rows
        .filter((row) => row.productId && row.quantity)
        .map((row) => ({
          productId: row.productId,
          unitId: productOf(row.productId)?.unitId ?? "",
          quantity: row.quantity,
          ...(row.note ? { [noteKey]: row.note } : {}),
        }));

    const journalRows = (rows: JournalRowState[], side: "debit" | "credit") =>
      rows
        .filter((row) => row.accountId && money(row.amount || "0") > 0n)
        .map((row) => ({
          accountId: row.accountId,
          debit: side === "debit" ? row.amount : "0",
          credit: side === "credit" ? row.amount : "0",
          ...(row.narration ? { narration: row.narration } : {}),
        }));

    switch (type) {
      case "sale":
      case "purchase":
        return {
          ...base,
          type,
          partyId,
          lines: activeLines,
          payments: activePayments,
          transportCost: transportCost || "0",
          laborCost: laborCost || "0",
          // Only the rows the user actually filled in. A half-typed row is not
          // a cost yet, and the server would refuse it for a missing খাত.
          otherCosts: otherCosts
            .filter((row) => row.accountId && row.amount)
            .map((row) => ({
              accountId: row.accountId,
              ...(row.label ? { label: row.label } : {}),
              amount: row.amount,
            })),
          discountType,
          discount: discount || "0",
        };
      case "sale_return":
      case "purchase_return":
        return { ...base, type, partyId, lines: activeLines, payments: activePayments };
      case "income":
      case "expense":
        return { ...base, type, categoryAccountId, payments: activePayments };
      case "customer_payment":
      case "vendor_payment":
        return { ...base, type, partyId, payments: activePayments };
      case "production":
        return {
          ...base,
          type,
          inputs: stockRows(prodInputs, "description"),
          outputs: stockRows(prodOutputs, "description"),
          wastage: stockRows(wastage, "reason"),
          laborCost: laborCost || "0",
          otherCost: productionOtherCost || "0",
          payments: activePayments,
        };
      case "stock_adjustment":
        return {
          ...base,
          type,
          // A counted zero is a real answer — "none left" — so unlike every
          // other row type these are filtered on the product alone.
          adjustments: adjustments
            .filter((row) => row.productId)
            .map((row) => ({
              productId: row.productId,
              unitId: productOf(row.productId)?.unitId ?? "",
              countedQuantity: row.quantity || "0",
              ...(row.note ? { reason: row.note } : {}),
            })),
        };
      case "other":
        return {
          ...base,
          type,
          entries: [
            ...journalRows(destinations, "debit"),
            ...journalRows(sources, "credit"),
          ],
        };
    }
  }

  /**
   * One save path, whether or not a PIN is riding along.
   *
   * The server is the authority on both halves of this: it recomputes every
   * figure from the raw input, and it re-checks the role and the PIN on the
   * retry. `canOverride` coming back is what raises the dialog; it is not
   * permission to do anything.
   */
  function save(
    payload: unknown,
    options: {
      override?: { pin: string; rules: OverridableRule[] };
      confirmDuplicate?: boolean;
      confirmUnusual?: boolean;
    } = {},
  ) {
    setResult(null);

    startTransition(async () => {
      const outcome = await createEntryAction(payload, options);
      setResult(outcome);

      if (outcome.ok) {
        closeGate();
        for (const warning of outcome.warnings) toast.show({ tone: "info", title: warning });
        // R4.4. The dialog replaces the toast as the confirmation, because it
        // is also where the receipt is offered — a toast that carries an
        // action is a toast people miss.
        setSaved(outcome);
        changeType(type);
        router.refresh();
        return;
      }

      // Anything the user can answer keeps the payload alive so the retry
      // posts exactly what the server already saw.
      const answerable = Boolean(outcome.canOverride || outcome.duplicate || outcome.unusual);
      setPendingPayload(answerable ? payload : null);
      if (!answerable) {
        setPin("");
        setOverrideRules([]);
        return;
      }

      if (outcome.blockedRule) {
        const rule = outcome.blockedRule;
        setOverrideRules((current) =>
          current.includes(rule) ? current : [...current, rule],
        );
      }
    });
  }

  function closeGate() {
    setPendingPayload(null);
    setAskingFinal(false);
    setPin("");
    setOverrideRules([]);
    setAnswered({});
  }

  /**
   * Spec R4.5. The same schema the server uses, run here first.
   *
   * An empty entry now comes back with a message against each field instead of
   * a round trip and a banner. The server still parses it again — this is
   * convenience, not authority — but the shopkeeper who tapped Save on a blank
   * form finds out which boxes are missing rather than that "something" is.
   */
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = buildPayload();

    const parsed = transactionInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = validationMessage(issue.message, t);
      }
      setResult({ ok: false, error: t.messages.fixTheFields, fieldErrors });
      return;
    }

    // R4.2's final confirmation, when the company asked for one.
    if (confirmEveryEntry) {
      setResult(null);
      setPendingPayload(payload);
      setAskingFinal(true);
      return;
    }

    save(payload);
  }

  /**
   * What, if anything, the user is being asked — spec R4.2.
   *
   * Derived from the last reply rather than held in its own state, so the
   * dialog and the banner can never disagree about what happened. The rule
   * itself lives in `./gate` so it can be tested without this form.
   */
  const gate = React.useMemo(
    () => deriveGate({ result, pendingPayload, askingFinal }),
    [result, pendingPayload, askingFinal],
  );

  const gateTitle =
    gate?.kind === "final"
      ? t.confirm.finalTitle
      : gate?.kind === "duplicate"
      ? t.duplicate.title
      : gate?.kind === "unusual"
        ? t.confirm.unusualTitle
        : t.override.overrideTitle;

  const gateBody =
    gate?.kind === "final"
      ? t.confirm.finalBody(formatMoney(total))
      : gate?.kind === "duplicate" && result && !result.ok && result.duplicate
      ? t.duplicate.body(
          result.duplicate.voucherNo,
          formatDateTime(result.duplicate.savedAt, t),
        )
      : gate?.kind === "unusual" && gate.detail.usual
        ? t.confirm.unusualMultiple(gate.detail.total, gate.detail.usual)
        : gate?.kind === "unusual"
          ? t.confirm.unusualAbsolute(gate.detail.total)
          : gate?.kind === "override"
            ? ((
                <>
                  <p>{result && !result.ok ? result.error : null}</p>
                  <p className="mt-2">{t.override.explain}</p>
                </>
              ) as React.ReactNode)
            : undefined;

  const summaryErrors =
    result && !result.ok
      ? Object.entries(result.fieldErrors ?? {}).map(([fieldId, message]) => ({
          fieldId,
          message,
        }))
      : [];

  /**
   * One panel, wherever products are picked.
   *
   * উৎপাদন and স্টক সমন্বয় pick products too, and a finished good that has
   * never been sold before is exactly the thing a first production run needs to
   * name. Declared once and rendered from each card.
   */
  function NewProductPanel() {
    return (
      <div className="rounded-md border border-border bg-surface-sunken p-4">
        <p className="mb-3 font-medium">{t.masterData.newProduct}</p>
        <ProductFields
          units={units}
          categories={productCategories}
          onCreated={(product) => setExtraProducts((current) => [...current, product])}
          onCancel={() => setAddingProduct(false)}
        />
      </div>
    );
  }

  const partyOptions = parties.filter((party) =>
    VENDOR_SIDE.includes(type)
      ? party.type === "vendor" || party.type === "both"
      : party.type === "customer" || party.type === "both",
  );

  const categories = type === "income" ? incomeCategories : expenseCategories;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.newEntry}</h1>
        <p className="text-sm text-muted-foreground">
          {t.entry.motto}
        </p>
      </div>

      {/* ---- 1. what happened ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{t.fields.type}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div
            role="radiogroup"
            aria-label={t.fields.type}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {[...PRIMARY_TYPES, ...(showMore ? MORE_TYPES : [])].map((option) => {
              const Icon = TYPE_ICON[option];
              const active = type === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => changeType(option)}
                  className={cn(
                    "flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors duration-150",
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-border-strong hover:bg-surface-sunken",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn("size-4", active ? "text-primary" : "text-subtle-foreground")} aria-hidden />
                    <span className={cn("font-medium", active && "text-primary")}>
                      {t.transactionType[option]}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t.transactionTypeHint[option]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progressive disclosure: the five rarer types stay folded away. */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            // This is how উৎপাদন and স্টক সমন্বয় are reached at all, and at
            // the text's own height it was a 20px target on a phone.
            className="-mx-2 flex min-h-11 cursor-pointer items-center gap-1 px-2 text-sm text-primary hover:underline"
          >
            <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
            {showMore ? t.entry.showFewerTypes : t.entry.showMoreTypes}
          </button>
        </CardBody>
      </Card>

      {summaryErrors.length > 0 || (result && !result.ok) ? (
        <ErrorSummary
          title={result && !result.ok ? result.error : t.messages.errorTitle}
          errors={summaryErrors}
        />
      ) : null}

      <VoiceScanPanel parties={parties} products={products} onDraft={applyDraft} />

      {/* ---- 2. the details ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{t.entry.details}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              fieldId="date"
              error={fieldErrors["date"]}
            >
              <FieldLabel required>{t.fields.date}</FieldLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>

            {NEEDS_PARTY.includes(type) ? (
              <Field
                fieldId="partyId"
                error={fieldErrors["partyId"]}
                hint={
                  selectedParty
                    ? `${t.due.previousDue}: ${formatMoney(previousDue)}`
                    : undefined
                }
              >
                <FieldLabel required>
                  {VENDOR_SIDE.includes(type) ? t.fields.vendor : t.fields.customer}
                </FieldLabel>
                <div className="flex gap-2">
                  <Select
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="flex-1"
                    required
                  >
                    <option value="">{t.entry.choosePrompt}</option>
                    {partyOptions.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name}
                      </option>
                    ))}
                  </Select>
                  {/* A customer who turns out not to exist yet should not cost
                      you the half-typed invoice you are standing in. */}
                  {canManageParties ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={
                      VENDOR_SIDE.includes(type)
                        ? t.masterData.newVendor
                        : t.masterData.newCustomer
                    }
                    onClick={() => setAddingParty((open) => !open)}
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                  ) : null}
                </div>
              </Field>
            ) : null}

            {NEEDS_CATEGORY.includes(type) ? (
              <Field
                fieldId="categoryAccountId"
                error={fieldErrors["categoryAccountId"]}
              >
                <FieldLabel required>{t.fields.category}</FieldLabel>
                <Select
                  value={categoryAccountId}
                  onChange={(e) => setCategoryAccountId(e.target.value)}
                  required
                >
                  <option value="">{t.entry.choosePrompt}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameBn}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>{t.fields.memoNo}</FieldLabel>
              <Input
                value={memoNo}
                onChange={(e) => setMemoNo(e.target.value)}
                placeholder={t.entry.ratePlaceholder}
              />
            </Field>

            {/* R4.3. Free text: often a driver or a delivery boy, not a user. */}
            <Field hint={t.entry.giverHint}>
              <FieldLabel>{t.fields.giverName}</FieldLabel>
              <Input value={giverName} onChange={(e) => setGiverName(e.target.value)} />
            </Field>
            <Field hint={t.entry.recipientHint}>
              <FieldLabel>{t.fields.recipientName}</FieldLabel>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </Field>
          </div>

          {addingParty && canManageParties && NEEDS_PARTY.includes(type) ? (
            <div className="rounded-md border border-border bg-surface-sunken p-4">
              <p className="mb-3 font-medium">
                {VENDOR_SIDE.includes(type)
                  ? t.masterData.newVendor
                  : t.masterData.newCustomer}
              </p>
              <PartyFields
                defaultType={VENDOR_SIDE.includes(type) ? "vendor" : "customer"}
                onCreated={(party) => {
                  setExtraParties((current) => [...current, party]);
                  setPartyId(party.id);
                }}
                onCancel={() => setAddingParty(false)}
              />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* ---- 3. goods ---- */}
      {NEEDS_LINES.includes(type) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.entry.products}</CardTitle>
            <span className="flex gap-1">
              {canManageProducts ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingProduct((open) => !open)}
                >
                  <Plus className="size-4" aria-hidden />
                  {t.masterData.newProduct}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((c) => [...c, emptyLine()])}
              >
                <Plus className="size-4" aria-hidden />
                {t.entry.lines}
              </Button>
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            {addingProduct && canManageProducts ? <NewProductPanel /> : null}
            {lines.map((line, index) => {
              const product = products.find((p) => p.id === line.productId);
              const amount = multiplyRate(qty(line.quantity || "0"), money(line.rate || "0"));
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                >
                  <Field
                    fieldId={`lines.${index}.productId`}
                    error={fieldErrors[`lines.${index}.productId`]}
                  >
                    <FieldLabel required>{t.fields.product}</FieldLabel>
                    <Select
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                    >
                      <option value="">{t.entry.choosePrompt}</option>
                      {products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.nameBn}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    fieldId={`lines.${index}.quantity`}
                    error={fieldErrors[`lines.${index}.quantity`]}
                    hint={product ? stockHint(product, t) : undefined}
                  >
                    <FieldLabel required>
                      {t.fields.quantity}
                      {product ? ` (${product.unitSymbol})` : ""}
                    </FieldLabel>
                    <Input
                      numeric
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      placeholder="0"
                    />
                  </Field>

                  {/*
                    The second measure. Paper is bought by weight and handed
                    over by the roll — "১২ রোল, ৫০০ কেজি" is one delivery, not
                    two numbers to choose between. `pieces` has been in the
                    schema and on the wire since the beginning; the form simply
                    never asked for it, so it went out empty on every entry.

                    Optional on purpose: the money is the weight times the rate,
                    and a shop selling loose goods has no count to give.
                  */}
                  <Field
                    fieldId={`lines.${index}.pieces`}
                    error={fieldErrors[`lines.${index}.pieces`]}
                  >
                    <FieldLabel>{t.fields.pieces}</FieldLabel>
                    <Input
                      numeric
                      value={line.pieces}
                      onChange={(e) => updateLine(line.key, { pieces: e.target.value })}
                      placeholder="0"
                    />
                  </Field>

                  <Field
                    fieldId={`lines.${index}.rate`}
                    error={fieldErrors[`lines.${index}.rate`]}
                    hint={amount > 0n ? formatMoney(amount) : undefined}
                  >
                    <FieldLabel required>{t.fields.rate}</FieldLabel>
                    <Input
                      numeric
                      value={line.rate}
                      onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                      placeholder="0"
                    />
                  </Field>

                  <div className="flex items-end pb-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.entry.removeLine(String(index + 1))}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((c) => c.filter((item) => item.key !== line.key))
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}

            {NEEDS_TRADE_COSTS.includes(type) ? (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  {/*
                    Freight and labour keep boxes of their own because they are
                    not just two more costs: they are the two that go into what
                    the goods are worth. Putting them in the list below would
                    hide the one distinction R3.4 is about.
                  */}
                  <Field hint={VENDOR_SIDE.includes(type) ? t.entry.costCapitalised : undefined}>
                    <FieldLabel>{t.fields.transportCost}</FieldLabel>
                    <Input
                      numeric
                      value={transportCost}
                      onChange={(e) => setTransportCost(e.target.value)}
                      placeholder="0"
                    />
                  </Field>
                  <Field hint={VENDOR_SIDE.includes(type) ? t.entry.costCapitalised : undefined}>
                    <FieldLabel>{t.fields.laborCost}</FieldLabel>
                    <Input
                      numeric
                      value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      placeholder="0"
                    />
                  </Field>

                {/* R3.4: how the discount is expressed, then the figure. */}
                <Field
                  hint={
                    discountType === "percent" && discountAmount > 0n
                      ? t.entry.discountWorksOutTo(formatMoney(discountAmount))
                      : undefined
                  }
                >
                  <FieldLabel>{t.fields.discount}</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      aria-label={t.entry.discountType}
                      className="w-32 shrink-0"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    >
                      <option value="amount">{t.entry.discountAmount}</option>
                      <option value="percent">{t.entry.discountPercent}</option>
                    </Select>
                    <Input
                      numeric
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </Field>
                </div>

                {/*
                  R3.4's cost list. One row per cost, each naming the খাত it
                  posts to — on a purchase it is expensed there rather than
                  buried in the stock value; on a sale it is all billed to the
                  customer as income, so the খাত is only a description.
                */}
                <div className="space-y-2">
                  {otherCosts.map((row, index) => (
                    <div
                      key={row.key}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
                    >
                      <Field fieldId={`otherCosts.${index}.accountId`} error={fieldErrors[`otherCosts.${index}.accountId`]}>
                        <FieldLabel required>{t.entry.costKind}</FieldLabel>
                        <Select
                          value={row.accountId}
                          onChange={(e) => updateCost(row.key, { accountId: e.target.value })}
                        >
                          <option value="">{t.entry.choosePrompt}</option>
                          {expenseCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.nameBn}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel>{t.entry.costName}</FieldLabel>
                        <Input
                          value={row.label}
                          onChange={(e) => updateCost(row.key, { label: e.target.value })}
                          placeholder={t.entry.costNamePlaceholder}
                        />
                      </Field>

                      <Field fieldId={`otherCosts.${index}.amount`} error={fieldErrors[`otherCosts.${index}.amount`]}>
                        <FieldLabel required>{t.entry.costAmount}</FieldLabel>
                        <Input
                          numeric
                          value={row.amount}
                          onChange={(e) => updateCost(row.key, { amount: e.target.value })}
                          placeholder="0"
                        />
                      </Field>

                      <div className="flex items-end pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t.entry.removeCost(String(index + 1))}
                          onClick={() =>
                            setOtherCosts((rows) => rows.filter((r) => r.key !== row.key))
                          }
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setOtherCosts((rows) => [...rows, emptyCost()])}
                    >
                      <Plus className="size-4" aria-hidden />
                      {t.entry.addCost}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {VENDOR_SIDE.includes(type) ? t.entry.costsHint : t.entry.costsHintSale}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---- 3b. উৎপাদন ---- */}
      {type === "production" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.transactionType.production}</CardTitle>
            {canManageProducts ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddingProduct((open) => !open)}
              >
                <Plus className="size-4" aria-hidden />
                {t.masterData.newProduct}
              </Button>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-5">
            {addingProduct && canManageProducts ? <NewProductPanel /> : null}
            {recipes.length > 0 ? (
              <div className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-[2fr_1fr]">
                <Field hint={t.entry.recipeHint}>
                  <FieldLabel>{t.fields.recipe}</FieldLabel>
                  <Select
                    value={recipeId}
                    onChange={(e) => applyRecipe(e.target.value, batchCount)}
                  >
                    <option value="">{t.entry.withoutRecipe}</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.nameBn ??
                          products.find((p) => p.id === recipe.outputProductId)?.nameBn ??
                          t.fields.recipe}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t.fields.batchCount}</FieldLabel>
                  <Input
                    numeric
                    value={batchCount}
                    onChange={(e) => {
                      setBatchCount(e.target.value);
                      if (recipeId) applyRecipe(recipeId, e.target.value);
                    }}
                    placeholder="1"
                  />
                </Field>
              </div>
            ) : null}

            <StockRows
              title={t.fields.inputProduct}
              hint={t.entry.inputsHint}
              rows={prodInputs}
              setRows={setProdInputs}
              products={products}
              quantityLabel={t.fields.quantity}
              errorPrefix="inputs"
              fieldErrors={fieldErrors}
              quantityHint={(_row, product) => (product ? stockHint(product, t) : undefined)}
            />

            <div className="border-t border-border pt-4">
              <StockRows
                title={t.fields.outputProduct}
                hint={t.entry.outputsHint}
                rows={prodOutputs}
                setRows={setProdOutputs}
                products={products}
                quantityLabel={t.fields.quantity}
                errorPrefix="outputs"
                fieldErrors={fieldErrors}
              />
            </div>

            <div className="border-t border-border pt-4">
              <StockRows
                title={t.fields.wastage}
                hint={t.entry.wastageHint}
                rows={wastage}
                setRows={setWastage}
                products={inputProducts}
                quantityLabel={t.fields.quantity}
                notePlaceholder={t.entry.reason}
                errorPrefix="wastage"
                fieldErrors={fieldErrors}
                minRows={0}
              />
            </div>

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t.fields.laborCost}</FieldLabel>
                <Input numeric value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel>{t.fields.otherCost}</FieldLabel>
                <Input
                  numeric
                  value={productionOtherCost}
                  onChange={(e) => setProductionOtherCost(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            {/* The engine refuses conversion cost that no wallet paid for —
                say so here rather than letting the save fail. */}
            {conversionCost !== paidTotal ? (
              <p
                role="status"
                className="rounded-md border border-due bg-due-soft p-3 text-sm text-due"
              >
                {t.entry.conversionCostNotice(
                  formatMoney(conversionCost),
                  formatMoney(paidTotal),
                )}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---- 3c. স্টক সমন্বয় ---- */}
      {type === "stock_adjustment" ? (
        <Card>
          <CardBody className="space-y-4">
            {addingProduct && canManageProducts ? <NewProductPanel /> : null}
            <StockRows
              title={t.transactionType.stock_adjustment}
              hint={t.entry.countHint}
              rows={adjustments}
              setRows={setAdjustments}
              products={products}
              quantityLabel={t.fields.countedQuantity}
              notePlaceholder={t.entry.reason}
              errorPrefix="adjustments"
              fieldErrors={fieldErrors}
              quantityHint={(row, product) => {
                if (!product) return undefined;
                const onHand = qtyFromDb(product.quantity);
                if (row.quantity === "") return stockHint(product, t);
                const delta = subQty(qty(row.quantity), onHand);
                if (delta === ZERO_QTY) return t.entry.countMatches;
                return delta > 0n
                  ? t.entry.countSurplus(`${formatQty(delta)} ${product.unitSymbol}`)
                  : t.entry.countShortfall(
                      `${formatQty((-delta) as Qty)} ${product.unitSymbol}`,
                    );
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      {/* ---- 3d. অন্যান্য ---- */}
      {type === "other" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.transactionType.other}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <JournalRows
              title={t.entry.fromWhere}
              hint={t.entry.fromWhereHint}
              rows={sources}
              setRows={setSources}
              accounts={postingAccounts}
              total={sourceTotal}
            />
            <div className="border-t border-border pt-4">
              <JournalRows
                title={t.entry.toWhere}
                hint={t.entry.toWhereHint}
                rows={destinations}
                setRows={setDestinations}
                accounts={postingAccounts}
                total={destinationTotal}
              />
            </div>

            {journalDifference !== ZERO ? (
              <p
                role="status"
                className="rounded-md border border-due bg-due-soft p-3 text-sm text-due"
              >
                {t.entry.journalUnbalanced(formatMoney(absMoney(journalDifference)))}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---- 4. money ----
           স্টক সমন্বয় and অন্যান্য never move cash, so they never ask for a
           wallet. উৎপাদন does, but only to pay the conversion cost. */}
      {type === "stock_adjustment" || type === "other" ? (
        <Card>
          <CardBody>
            <Field>
              <FieldLabel>{t.fields.description}</FieldLabel>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>{t.fields.paymentMethod}</CardTitle>
          {NEEDS_LINES.includes(type) || type === "production" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setPayments((c) => [
                  ...c,
                  { key: newKey(), financialAccountId: defaultWallet?.id ?? "", amount: "", handledByName: "" },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              {t.actions.addNew}
            </Button>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3">
          {payments.map((payment, index) => (
            <div
              key={payment.key}
              className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]"
            >
              <Field
                fieldId={`payments.${index}.financialAccountId`}
                error={fieldErrors[`payments.${index}.financialAccountId`]}
              >
                <FieldLabel required={!NEEDS_LINES.includes(type)}>{t.entry.method}</FieldLabel>
                <Select
                  value={payment.financialAccountId}
                  onChange={(e) =>
                    setPayments((c) =>
                      c.map((p) =>
                        p.key === payment.key ? { ...p, financialAccountId: e.target.value } : p,
                      ),
                    )
                  }
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nameBn}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                fieldId={`payments.${index}.amount`}
                error={fieldErrors[`payments.${index}.amount`]}
              >
                <FieldLabel required={!NEEDS_LINES.includes(type)}>
                  {t.fields.paidAmount}
                </FieldLabel>
                <Input
                  numeric
                  value={payment.amount}
                  onChange={(e) =>
                    setPayments((c) =>
                      c.map((p) => (p.key === payment.key ? { ...p, amount: e.target.value } : p)),
                    )
                  }
                  placeholder="0"
                />
              </Field>

              <Field>
                <FieldLabel>{t.fields.handledBy}</FieldLabel>
                <Input
                  value={payment.handledByName}
                  onChange={(e) =>
                    setPayments((c) =>
                      c.map((p) =>
                        p.key === payment.key ? { ...p, handledByName: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder={t.fields.name}
                />
              </Field>

              <div className="flex items-end pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.entry.removePayment(String(index + 1))}
                  disabled={payments.length === 1}
                  onClick={() => setPayments((c) => c.filter((p) => p.key !== payment.key))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}

          <Field>
            <FieldLabel>{t.fields.description}</FieldLabel>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>
      )}

      {/* ---- 5. what it comes to ----
           Spec §13's arithmetic, shown before saving rather than after. */}
      <Card className="sticky bottom-20 z-20 md:bottom-4">
        <CardBody className="space-y-3">
          {/* No party, no bill, no due — showing four zeroes would only
              suggest the entry had failed to register. */}
          {NO_PARTY_TOTALS.includes(type) ? (
            <p className="text-sm text-muted-foreground">
              {type === "production"
                ? t.entry.productionNoDue
                : type === "stock_adjustment"
                  ? t.entry.adjustmentNoDue
                  : t.entry.bothSidesMustMatch}
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t.due.previousDue}</dt>
                <dd>
                  <MoneyText value={previousDue} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.due.currentBill}</dt>
                <dd>
                  <MoneyText value={total} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.due.payment}</dt>
                <dd>
                  <MoneyText value={paidTotal} size="sm" tone="credit" />
                </dd>
              </div>
              <div>
                <dt className="font-medium">{t.due.newDue}</dt>
                <dd>
                  <MoneyText
                    value={addMoney(previousDue, due)}
                    size="lg"
                    tone={addMoney(previousDue, due) > 0n ? "due" : "neutral"}
                  />
                </dd>
              </div>
            </dl>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => changeType(type)}>
              {t.actions.clear}
            </Button>
            <Button type="submit" size="lg" loading={pending} className="sm:min-w-52">
              {t.actions.save}
            </Button>
          </div>

          <p className="text-xs text-subtle-foreground">
            {t.entry.serverRecomputes}
          </p>
        </CardBody>
      </Card>

      {/*
        Spec R4.4. The receipt is the transaction page itself — one layout,
        so an entry cannot say one total on screen and another on paper.
      */}
      <Dialog
        open={saved !== null}
        onOpenChange={(next) => {
          if (!next) setSaved(null);
        }}
        closeLabel={t.actions.close}
        title={t.entry.savedTitle}
        description={
          saved ? (
            <>
              <p className="num text-lg font-semibold text-foreground">{saved.voucherNo}</p>
              <p className="mt-1">
                {t.entry.savedTotal(formatMoney(money(saved.total)))}
                {money(saved.due) > 0n
                  ? ` · ${t.fields.dueAmount} ${formatMoney(money(saved.due))}`
                  : ""}
              </p>
            </>
          ) : undefined
        }
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSaved(null)}>
              {t.entry.savedAnother}
            </Button>
            {saved ? (
              <Button asChild>
                <Link href={`/transactions/${saved.transactionId}?print=1` as Route}>
                  <Printer className="size-4" aria-hidden />
                  {t.transactions.printReceipt}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/*
        Spec R4.2. One gate, three questions.

        The kind of question decides the wording and the buttons; the shell,
        the focus handling and the dismiss behaviour are decided once. An
        override is blocking — a refusal dismissed by a stray click outside
        reads exactly like a save, and the entry is not saved — while the two
        questions are not, because "no" is a legitimate answer to both.
      */}
      <Dialog
        open={gate !== null}
        onOpenChange={(next) => {
          if (!next) closeGate();
        }}
        blocking={gate?.kind === "override"}
        closeLabel={t.actions.close}
        title={gateTitle}
        description={gateBody}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeGate}>
              {t.actions.cancel}
            </Button>
            {gate?.kind === "override" ? (
              <Button
                type="button"
                loading={pending}
                disabled={pin.trim().length < 4}
                onClick={() => {
                  if (pendingPayload !== null) {
                    save(pendingPayload, {
                      override: { pin, rules: overrideRules },
                      ...answered,
                    });
                  }
                }}
              >
                {t.override.submit}
              </Button>
            ) : null}
            {gate?.kind === "duplicate" ? (
              <Button
                type="button"
                loading={pending}
                onClick={() => {
                  setAnswered((current) => ({ ...current, duplicate: true }));
                  if (pendingPayload !== null) {
                    save(pendingPayload, { ...answered, confirmDuplicate: true });
                  }
                }}
              >
                {t.duplicate.saveAnyway}
              </Button>
            ) : null}
            {gate?.kind === "final" ? (
              <Button
                type="button"
                loading={pending}
                onClick={() => {
                  setAskingFinal(false);
                  if (pendingPayload !== null) save(pendingPayload);
                }}
              >
                {t.actions.saveShort}
              </Button>
            ) : null}
            {gate?.kind === "unusual" ? (
              <Button
                type="button"
                loading={pending}
                onClick={() => {
                  setAnswered((current) => ({ ...current, unusual: true }));
                  if (pendingPayload !== null) {
                    save(pendingPayload, { ...answered, confirmUnusual: true });
                  }
                }}
              >
                {t.confirm.yesItIsRight}
              </Button>
            ) : null}
          </>
        }
      >
        {gate?.kind === "override" ? (
          <Field fieldId="overridePin" hint={t.override.pinHint}>
            <FieldLabel required>{t.override.pin}</FieldLabel>
            <Input
              id="overridePin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (pendingPayload !== null && pin.trim().length >= 4) {
                    save(pendingPayload, {
                      override: { pin, rules: overrideRules },
                      ...answered,
                    });
                  }
                }
              }}
            />
          </Field>
        ) : null}

        {gate?.kind === "duplicate" ? (
          <Link
            href={`/transactions/${gate.candidate.id}` as Route}
            className="inline-flex min-h-11 items-center text-primary hover:underline"
            target="_blank"
          >
            {t.duplicate.viewExisting} — {gate.candidate.voucherNo}
          </Link>
        ) : null}
      </Dialog>

    </form>
  );
}
