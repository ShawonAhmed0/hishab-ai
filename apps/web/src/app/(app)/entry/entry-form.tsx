"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import {
  ZERO,
  addMoney,
  bn,
  formatMoney,
  money,
  moneyFromDb,
  multiplyRate,
  qty,
  subMoney,
  type Money,
  type TransactionType,
} from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorSummary, Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyText } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn, todayIso } from "@/lib/utils";
import { createEntryAction, type EntryResult } from "./actions";
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

interface Props {
  parties: PartyOption[];
  products: ProductOption[];
  units: UnitOption[];
  wallets: WalletOption[];
  incomeCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
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

const newKey = () => Math.random().toString(36).slice(2);
const emptyLine = (): LineState => ({
  key: newKey(),
  productId: "",
  unitId: "",
  quantity: "",
  rate: "",
  pieces: "",
});

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
const NEEDS_TRADE_COSTS: TransactionType[] = ["sale", "purchase"];
const VENDOR_SIDE: TransactionType[] = ["purchase", "vendor_payment", "purchase_return"];

export function EntryForm({
  parties,
  products,
  units,
  wallets,
  incomeCategories,
  expenseCategories,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];

  const [type, setType] = React.useState<TransactionType>("sale");
  const [showMore, setShowMore] = React.useState(false);
  const [date, setDate] = React.useState(todayIso());
  const [partyId, setPartyId] = React.useState("");
  const [categoryAccountId, setCategoryAccountId] = React.useState("");
  const [lines, setLines] = React.useState<LineState[]>([emptyLine()]);
  const [transportCost, setTransportCost] = React.useState("");
  const [laborCost, setLaborCost] = React.useState("");
  const [otherCost, setOtherCost] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [payments, setPayments] = React.useState<PaymentState[]>([
    {
      key: newKey(),
      financialAccountId: defaultWallet?.id ?? "",
      amount: "",
      handledByName: "",
    },
  ]);
  const [memoNo, setMemoNo] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [source, setSource] = React.useState<"manual" | "voice" | "scan">("manual");

  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<EntryResult | null>(null);

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
        ? addMoney(money(transportCost || "0"), money(laborCost || "0"), money(otherCost || "0"))
        : ZERO,
    [type, transportCost, laborCost, otherCost],
  );

  const paidTotal = React.useMemo<Money>(
    () => payments.reduce<Money>((total, p) => addMoney(total, money(p.amount || "0")), ZERO),
    [payments],
  );

  const total = React.useMemo<Money>(() => {
    if (NEEDS_CATEGORY.includes(type) || type === "customer_payment" || type === "vendor_payment") {
      return paidTotal;
    }
    return subMoney(addMoney(subtotal, charges), money(discount || "0"));
  }, [type, subtotal, charges, discount, paidTotal]);

  const due = subMoney(total, paidTotal);

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
    setOtherCost("");
    setDiscount("");
    setSource("manual");
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
          otherCost: otherCost || "0",
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
      default:
        return { ...base, type };
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);

    startTransition(async () => {
      const outcome = await createEntryAction(buildPayload());
      setResult(outcome);

      if (outcome.ok) {
        toast.success(
          `${bn.messages.saved} — ${outcome.voucherNo}`,
          `সর্বমোট ${formatMoney(money(outcome.total))}`,
        );
        for (const warning of outcome.warnings) toast.show({ tone: "info", title: warning });
        changeType(type);
        router.refresh();
      }
    });
  }

  const summaryErrors =
    result && !result.ok
      ? Object.entries(result.fieldErrors ?? {}).map(([fieldId, message]) => ({
          fieldId,
          message,
        }))
      : [];

  const partyOptions = parties.filter((party) =>
    VENDOR_SIDE.includes(type)
      ? party.type === "vendor" || party.type === "both"
      : party.type === "customer" || party.type === "both",
  );

  const categories = type === "income" ? incomeCategories : expenseCategories;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{bn.nav.newEntry}</h1>
        <p className="text-sm text-muted-foreground">
          একবার লিখুন — হিসাব, স্টক আর বকেয়া নিজে থেকেই ঠিক হয়ে যাবে
        </p>
      </div>

      {/* ---- 1. what happened ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{bn.fields.type}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div
            role="radiogroup"
            aria-label={bn.fields.type}
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
                      {bn.transactionType[option]}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {bn.transactionTypeHint[option]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progressive disclosure: the five rarer types stay folded away. */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex cursor-pointer items-center gap-1 text-sm text-primary hover:underline"
          >
            <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
            {showMore ? "কম দেখান" : "আরও ধরন দেখান"}
          </button>
        </CardBody>
      </Card>

      {summaryErrors.length > 0 || (result && !result.ok) ? (
        <ErrorSummary
          title={result && !result.ok ? result.error : bn.messages.errorTitle}
          errors={summaryErrors}
        />
      ) : null}

      <VoiceScanPanel parties={parties} products={products} onDraft={applyDraft} />

      {/* ---- 2. the details ---- */}
      <Card>
        <CardHeader>
          <CardTitle>বিস্তারিত</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={fieldErrors["date"]}>
              <FieldLabel required>{bn.fields.date}</FieldLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>

            {NEEDS_PARTY.includes(type) ? (
              <Field
                error={fieldErrors["partyId"]}
                hint={
                  selectedParty
                    ? `${bn.due.previousDue}: ${formatMoney(previousDue)}`
                    : undefined
                }
              >
                <FieldLabel required>
                  {VENDOR_SIDE.includes(type) ? bn.fields.vendor : bn.fields.customer}
                </FieldLabel>
                <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                  <option value="">— নির্বাচন করুন —</option>
                  {partyOptions.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {NEEDS_CATEGORY.includes(type) ? (
              <Field error={fieldErrors["categoryAccountId"]}>
                <FieldLabel required>{bn.fields.category}</FieldLabel>
                <Select
                  value={categoryAccountId}
                  onChange={(e) => setCategoryAccountId(e.target.value)}
                  required
                >
                  <option value="">— নির্বাচন করুন —</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameBn}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>{bn.fields.memoNo}</FieldLabel>
              <Input
                value={memoNo}
                onChange={(e) => setMemoNo(e.target.value)}
                placeholder="১২৫"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ---- 3. goods ---- */}
      {NEEDS_LINES.includes(type) ? (
        <Card>
          <CardHeader>
            <CardTitle>পণ্য</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLines((c) => [...c, emptyLine()])}
            >
              <Plus className="size-4" aria-hidden />
              {bn.actions.addNew}
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {lines.map((line, index) => {
              const product = products.find((p) => p.id === line.productId);
              const amount = multiplyRate(qty(line.quantity || "0"), money(line.rate || "0"));
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <Field error={fieldErrors[`lines.${index}.productId`]}>
                    <FieldLabel required>{bn.fields.product}</FieldLabel>
                    <Select
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                    >
                      <option value="">— নির্বাচন করুন —</option>
                      {products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.nameBn}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    error={fieldErrors[`lines.${index}.quantity`]}
                    hint={product ? `স্টক ${product.quantity} ${product.unitSymbol}` : undefined}
                  >
                    <FieldLabel required>
                      {bn.fields.quantity}
                      {product ? ` (${product.unitSymbol})` : ""}
                    </FieldLabel>
                    <Input
                      numeric
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      placeholder="0"
                    />
                  </Field>

                  <Field
                    error={fieldErrors[`lines.${index}.rate`]}
                    hint={amount > 0n ? formatMoney(amount) : undefined}
                  >
                    <FieldLabel required>{bn.fields.rate}</FieldLabel>
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
                      aria-label={`লাইন ${index + 1} মুছুন`}
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
              <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-4">
                <Field>
                  <FieldLabel>{bn.fields.transportCost}</FieldLabel>
                  <Input numeric value={transportCost} onChange={(e) => setTransportCost(e.target.value)} placeholder="0" />
                </Field>
                <Field>
                  <FieldLabel>{bn.fields.laborCost}</FieldLabel>
                  <Input numeric value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
                </Field>
                <Field>
                  <FieldLabel>{bn.fields.otherCost}</FieldLabel>
                  <Input numeric value={otherCost} onChange={(e) => setOtherCost(e.target.value)} placeholder="0" />
                </Field>
                <Field>
                  <FieldLabel>{bn.fields.discount}</FieldLabel>
                  <Input numeric value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                </Field>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---- 4. money ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{bn.fields.paymentMethod}</CardTitle>
          {NEEDS_LINES.includes(type) ? (
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
              {bn.actions.addNew}
            </Button>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3">
          {payments.map((payment, index) => (
            <div
              key={payment.key}
              className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]"
            >
              <Field error={fieldErrors[`payments.${index}.financialAccountId`]}>
                <FieldLabel required={!NEEDS_LINES.includes(type)}>মাধ্যম</FieldLabel>
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

              <Field error={fieldErrors[`payments.${index}.amount`]}>
                <FieldLabel required={!NEEDS_LINES.includes(type)}>
                  {bn.fields.paidAmount}
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
                <FieldLabel>{bn.fields.handledBy}</FieldLabel>
                <Input
                  value={payment.handledByName}
                  onChange={(e) =>
                    setPayments((c) =>
                      c.map((p) =>
                        p.key === payment.key ? { ...p, handledByName: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder="নাম"
                />
              </Field>

              <div className="flex items-end pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`পেমেন্ট ${index + 1} মুছুন`}
                  disabled={payments.length === 1}
                  onClick={() => setPayments((c) => c.filter((p) => p.key !== payment.key))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}

          <Field>
            <FieldLabel>{bn.fields.description}</FieldLabel>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      {/* ---- 5. what it comes to ----
           Spec §13's arithmetic, shown before saving rather than after. */}
      <Card className="sticky bottom-20 z-20 md:bottom-4">
        <CardBody className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{bn.due.previousDue}</dt>
              <dd>
                <MoneyText value={previousDue} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{bn.due.currentBill}</dt>
              <dd>
                <MoneyText value={total} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{bn.due.payment}</dt>
              <dd>
                <MoneyText value={paidTotal} size="sm" tone="credit" />
              </dd>
            </div>
            <div>
              <dt className="font-medium">{bn.due.newDue}</dt>
              <dd>
                <MoneyText
                  value={addMoney(previousDue, due)}
                  size="lg"
                  tone={addMoney(previousDue, due) > 0n ? "due" : "neutral"}
                />
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => changeType(type)}>
              {bn.actions.clear}
            </Button>
            <Button type="submit" size="lg" loading={pending} className="sm:min-w-52">
              {bn.actions.save}
            </Button>
          </div>

          <p className="text-xs text-subtle-foreground">
            উপরের অঙ্কগুলো শুধু দেখানোর জন্য — সংরক্ষণের সময় সার্ভার নিজে হিসাব করে নেবে।
          </p>
        </CardBody>
      </Card>
    </form>
  );
}
