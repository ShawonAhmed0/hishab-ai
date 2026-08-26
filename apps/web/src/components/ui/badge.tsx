import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-muted-foreground",
        info: "bg-info-soft text-info",
        credit: "bg-credit-soft text-credit",
        debit: "bg-debit-soft text-debit",
        due: "bg-due-soft text-due",
        accent: "bg-accent-soft text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
