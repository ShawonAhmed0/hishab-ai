"use client";

import * as React from "react";
import { Camera, Mic, Sparkles, Square } from "lucide-react";
import { normalizeDigits, type Dictionary, type TransactionType } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, Textarea } from "@/components/ui/field";
import type { PartyOption, ProductOption } from "./entry-form";

/**
 * AI entry, gated behind review.
 *
 * The parser here is a local heuristic stub — the real one (Whisper for
 * Bengali speech, Claude for extraction) is wired in a later phase. What is
 * NOT a stub is the flow around it, because that is the part with the safety
 * property: ভয়েস → AI → ফর্ম → যাচাই → নিশ্চিত → সংরক্ষণ. Parsed values only
 * ever populate the form. Nothing here can submit an entry.
 */

export interface ParsedDraft {
  type?: TransactionType;
  date?: string;
  partyId?: string;
  memoNo?: string;
  description?: string;
  paidAmount?: string;
  lines?: { productId?: string; unitId?: string; quantity?: string; rate?: string }[];
  source: "voice" | "scan";
}

interface Understood {
  label: string;
  value: string;
  confident: boolean;
}

// --- number words -----------------------------------------------------------

const SCALE_WORDS: [RegExp, number][] = [
  [/কোটি|coti|kuti/i, 10_000_000],
  [/লাখ|লক্ষ|lakh|lak/i, 100_000],
  [/হাজার|hazar|hajar/i, 1_000],
];

/** "৮০ হাজার টাকা" → 80000. Bare numbers pass straight through. */
function readAmount(text: string): number | undefined {
  const normalized = normalizeDigits(text);
  for (const [pattern, scale] of SCALE_WORDS) {
    const match = normalized.match(
      new RegExp(`([\\d,.]+)\\s*(?:${pattern.source})`, "i"),
    );
    if (match?.[1]) return Number(match[1].replace(/,/g, "")) * scale;
  }
  const bare = normalized.match(/([\d,]+(?:\.\d+)?)\s*(?:টাকা|taka|tk)/i);
  if (bare?.[1]) return Number(bare[1].replace(/,/g, ""));
  return undefined;
}

function readQuantity(text: string): { quantity: string; unit: string } | undefined {
  const normalized = normalizeDigits(text);
  const match = normalized.match(
    /([\d,]+(?:\.\d+)?)\s*(কেজি|কিলো|kg|পিস|pcs|piece|রোল|roll|টন|ton|বস্তা|bag)/i,
  );
  if (!match?.[1]) return undefined;
  return { quantity: match[1].replace(/,/g, ""), unit: match[2] ?? "" };
}

function readMemo(text: string): string | undefined {
  const normalized = normalizeDigits(text);
  const match = normalized.match(/(?:মেমো|memo|চালান|invoice)\s*(?:নং|no\.?|number)?\s*([\w-]+)/i);
  return match?.[1];
}

function readType(text: string): TransactionType | undefined {
  if (/বিক্রি|বিক্রয়|bikri|bikroy|sold|sale/i.test(text)) return "sale";
  if (/কিনেছি|ক্রয়|কিনলাম|kinechi|kroy|purchase|bought/i.test(text)) return "purchase";
  if (/ফেরত\s*দিয়েছে|ফেরত\s*এসেছে|return/i.test(text)) return "sale_return";
  if (/বকেয়া.*(পেয়েছি|দিয়েছে)|payment\s*received|টাকা\s*জমা/i.test(text))
    return "customer_payment";
  if (/খরচ|ব্যয়|kharoch|expense|বিল\s*দিয়েছি/i.test(text)) return "expense";
  if (/আয়|income|ভাড়া\s*পেয়েছি/i.test(text)) return "income";
  return undefined;
}

/** Longest matching name wins, so "মায়ের দোয়া ট্রেডার্স" beats "মায়ের দোয়া". */
function matchByName<T extends { id: string }>(
  text: string,
  candidates: T[],
  nameOf: (item: T) => string,
): T | undefined {
  let best: T | undefined;
  let bestLength = 0;
  for (const candidate of candidates) {
    const name = nameOf(candidate).trim();
    if (name.length < 2) continue;
    if (text.includes(name) && name.length > bestLength) {
      best = candidate;
      bestLength = name.length;
    }
  }
  return best;
}

function parse(
  text: string,
  parties: PartyOption[],
  products: ProductOption[],
  source: "voice" | "scan",
  t: Dictionary,
): { draft: ParsedDraft; understood: Understood[] } {
  const type = readType(text);
  const party = matchByName(text, parties, (p) => p.name);
  const product = matchByName(text, products, (p) => p.nameBn);
  const quantity = readQuantity(text);
  const memoNo = readMemo(text);

  // The largest money figure is the bill; a smaller one is what was paid.
  const amounts = [...normalizeDigits(text).matchAll(/([\d,]+(?:\.\d+)?)\s*(?:হাজার|লাখ|কোটি|টাকা|taka|tk)/gi)]
    .map((match) => readAmount(match[0]) ?? 0)
    .filter((value) => value > 0)
    .sort((a, b) => b - a);

  const total = amounts[0];
  const paid = amounts[1];

  const rate =
    total !== undefined && quantity ? String(total / Number(quantity.quantity)) : undefined;

  const draft: ParsedDraft = { source };
  if (type) draft.type = type;
  if (party) draft.partyId = party.id;
  if (memoNo) draft.memoNo = memoNo;
  if (paid !== undefined) draft.paidAmount = String(paid);
  draft.description = text.trim().slice(0, 500);

  if (product && quantity) {
    draft.lines = [
      {
        productId: product.id,
        unitId: product.unitId,
        quantity: quantity.quantity,
        ...(rate ? { rate } : {}),
      },
    ];
  }

  const unknown = t.entry.voiceNotUnderstood;
  const understood: Understood[] = [
    {
      label: t.fields.type,
      value: type ? t.transactionType[type] : unknown,
      confident: Boolean(type),
    },
    { label: t.fields.party, value: party?.name ?? unknown, confident: Boolean(party) },
    { label: t.fields.product, value: product?.nameBn ?? unknown, confident: Boolean(product) },
    {
      label: t.fields.quantity,
      value: quantity ? `${quantity.quantity} ${quantity.unit}` : unknown,
      confident: Boolean(quantity),
    },
    {
      label: t.fields.grandTotal,
      value: total !== undefined ? `৳ ${total.toLocaleString("en-IN")}` : unknown,
      confident: total !== undefined,
    },
    {
      label: t.fields.paidAmount,
      value: paid !== undefined ? `৳ ${paid.toLocaleString("en-IN")}` : unknown,
      confident: paid !== undefined,
    },
    { label: t.fields.memoNo, value: memoNo ?? unknown, confident: Boolean(memoNo) },
  ];

  return { draft, understood };
}

// --- component --------------------------------------------------------------

export function VoiceScanPanel({
  parties,
  products,
  onDraft,
}: {
  parties: PartyOption[];
  products: ProductOption[];
  onDraft: (draft: ParsedDraft) => void;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    draft: ParsedDraft;
    understood: Understood[];
  } | null>(null);

  const recognitionRef = React.useRef<{ stop: () => void } | null>(null);

  const speechAvailable =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => never }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never })
        .webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor() as unknown as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
    };

    recognition.lang = "bn-BD";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i]?.[0]?.transcript ?? "";
      }
      setText(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden />
          {t.entry.voiceTitle}
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? t.actions.close : t.entry.voiceOpen}
        </Button>
      </CardHeader>

      {open ? (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={listening ? "destructive" : "secondary"}
              onClick={toggleListening}
              disabled={!speechAvailable}
            >
              {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              {listening ? t.entry.voiceStop : t.entry.voiceStart}
            </Button>

            <Button type="button" variant="secondary" disabled>
              <Camera className="size-4" aria-hidden />
              {t.entry.scanMemo}
              <Badge tone="neutral" className="ml-1">
                {t.entry.comingSoon}
              </Badge>
            </Button>
          </div>

          {!speechAvailable ? (
            <p className="text-xs text-muted-foreground">
              {t.entry.voiceUnavailable}
            </p>
          ) : null}

          <Field hint={t.entry.voiceExample}>
            <FieldLabel>{t.entry.whatYouSaid}</FieldLabel>
            <Textarea
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t.entry.voicePlaceholder}
            />
          </Field>

          <Button
            type="button"
            variant="accent"
            disabled={text.trim().length === 0}
            onClick={() => setPreview(parse(text, parties, products, "voice", t))}
          >
            <Sparkles className="size-4" aria-hidden />
            {t.entry.voiceParse}
          </Button>

          {preview ? (
            <div className="rounded-lg border border-accent bg-accent-soft p-3">
              <p className="mb-2 text-sm font-medium">{t.messages.reviewBeforeSave}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                {preview.understood.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className={item.confident ? "font-medium" : "text-subtle-foreground"}>
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    onDraft(preview.draft);
                    setPreview(null);
                    setOpen(false);
                  }}
                >
                  {t.entry.voiceApply}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                  {t.actions.cancel}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.entry.voiceReviewNotice}
              </p>
            </div>
          ) : null}
        </CardBody>
      ) : null}
    </Card>
  );
}
