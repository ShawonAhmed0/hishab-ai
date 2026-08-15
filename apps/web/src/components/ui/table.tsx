import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dense table primitives.
 *
 * The wrapper scrolls, not the page — a nine-column ledger must never make the
 * whole document scroll sideways on a phone. Where a table would be unreadable
 * at 375px, the page renders `<MobileCards>` instead and hides the table.
 */
export function TableScroll({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("table-scroll -mx-px", className)}>
      <table className="w-full min-w-[42rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-surface-sunken text-left">
      {children}
    </thead>
  );
}

export function TH({
  className,
  numeric,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        numeric && "text-right",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0 transition-colors duration-150 hover:bg-surface-sunken",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td className={cn("px-3 py-2.5 align-middle", numeric && "text-right", className)} {...props}>
      {children}
    </td>
  );
}

/** The 375px fallback: one card per row, label and value stacked. */
export function MobileCards({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y divide-border md:hidden">{children}</div>;
}

export function MobileRow({
  title,
  subtitle,
  right,
  meta,
  onClick,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  meta?: React.ReactNode;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { onClick, type: "button" as const } : {})}
      className={cn(
        "flex w-full items-start justify-between gap-3 px-4 py-3 text-left",
        onClick && "cursor-pointer transition-colors duration-150 hover:bg-surface-sunken",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {meta ? <div className="mt-1 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
    </Wrapper>
  );
}
