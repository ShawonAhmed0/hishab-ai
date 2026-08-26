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
  narrow,
  children,
}: {
  className?: string;
  /** Two or three columns that fit anywhere — a P&L section, a totals block.
   *  The 42rem floor exists to stop a wide ledger from squeezing itself into
   *  something unreadable, and applying it here would force a scrollbar onto a
   *  table that was already narrower than the card holding it. */
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("table-scroll -mx-px", className)}>
      <table
        className={cn("w-full border-collapse text-sm", !narrow && "min-w-[42rem]")}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * Column names sit under a rule rather than inside a grey band.
 *
 * The band was doing two jobs badly: it competed with the sunken filter strip
 * directly above it on every list page — two recessed bars stacked, so neither
 * read as recessed — and a filled header makes the head look like another row
 * of data. A single decisive rule separates it and leaves the rows the only
 * thing with weight.
 */
export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border-strong text-left">{children}</thead>
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
        // Not uppercase, and not letter-spaced. Bengali has no case, so
        // `uppercase` changes the English column headers and leaves the
        // Bengali ones untouched — the two locales end up with structurally
        // different headers, and the default locale is the one that loses the
        // treatment. Weight and colour say "header" in both scripts.
        "px-3 py-2.5 text-xs font-semibold text-muted-foreground",
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
    <td
      className={cn(
        "px-3 py-2.5 align-middle",
        // A right-aligned column of proportional digits does not line up: the
        // 1s are narrow and every row sits at a different width. `numeric`
        // therefore carries the figures too, rather than each page
        // remembering to add `.num` — which two of fifteen call sites did.
        numeric && "num text-right",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/**
 * The 375px fallback: one card per row, label and value stacked.
 *
 * `md:hidden` because it normally sits beside a table that takes over on wider
 * screens. Search results have no table — the rows are of three different
 * shapes — so that page passes `md:flex` to keep the list at every width.
 */
export function MobileCards({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col divide-y divide-border md:hidden", className)}>
      {children}
    </div>
  );
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

/**
 * The totals under a ledger.
 *
 * Seven pages hand-wrote `border-t-2 border-border-strong bg-surface-sunken`
 * on a plain `<TR>`, which also inherited the row hover — so a totals line lit
 * up under the pointer as though it could be opened. A total is a conclusion,
 * not a row you can click.
 */
export function TFoot({ children }: { children: React.ReactNode }) {
  return <tfoot>{children}</tfoot>;
}

export function TotalRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-t-2 border-border-strong bg-surface-sunken font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}
