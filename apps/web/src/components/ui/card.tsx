import * as React from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "flat" | "interactive" | "tinted";

const CARD_VARIANT: Record<CardVariant, string> = {
  default: "border-border bg-surface shadow-card",
  flat: "border-border bg-surface shadow-none",
  interactive:
    "border-border bg-surface shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised active:translate-y-0",
  tinted: "border-primary/10 bg-primary-soft/45 shadow-none",
};

export function Card({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return (
    <div
      data-slot="card"
      className={cn(
        // `min-w-0` is load-bearing, not tidying. A card is usually a grid or
        // flex item, and such an item defaults to `min-width: auto` — it
        // refuses to shrink below its contents' minimum. A card holding a
        // ledger inherits that table's `min-w-[42rem]` as its own floor, so it
        // grew past its track and pushed the *page* into a horizontal scroll:
        // the dashboard's entries card was 191px wider than its column at
        // every width between 768 and 1280. The table already scrolls inside
        // its own box; the card has to be allowed to be narrower than it.
        "min-w-0 rounded-xl border",
        CARD_VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-[-0.01em]", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-border px-4 py-3.5 sm:px-5", className)}
      {...props}
    />
  );
}

/**
 * Empty states carry a next action, never just an apology — spec's "smart
 * empty states".
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-xl bg-surface-sunken">
          <Icon className="size-6 text-subtle-foreground" />
        </div>
      ) : null}
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
