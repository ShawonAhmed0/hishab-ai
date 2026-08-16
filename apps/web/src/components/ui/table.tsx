import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
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

export function MobileRow<T extends string>({
  title,
  subtitle,
  right,
  meta,
  href,
  onClick,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  meta?: React.ReactNode;
  /** A row that navigates. Preferred over onClick: it works from a server
   *  component, and it is a real link — middle-click, copy, open in new tab.
   *
   *  Generic for the same reason Link is: `typedRoutes` checks an interpolated
   *  path against the known routes by inferring the literal type, and a
   *  non-generic prop collapses it to `unknown` and rejects every template
   *  string. */
  href?: Route<T>;
  onClick?: () => void;
}) {
  const interactive = Boolean(href || onClick);
  const className = cn(
    "flex w-full items-start justify-between gap-3 px-4 py-3 text-left",
    interactive && "cursor-pointer transition-colors duration-150 hover:bg-surface-sunken",
  );

  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {meta ? <div className="mt-1 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
    </>
  );

  // Three explicit branches rather than one computed wrapper: a union of
  // Link | "button" | "div" cannot be narrowed enough for `href` to typecheck,
  // and spreading props conditionally hides which element actually renders.
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
