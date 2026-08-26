import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { X } from "lucide-react";
import { Button } from "./button";
import { controlBase, controlBorder, controlCheckbox } from "./control";
import { cn } from "@/lib/utils";

/**
 * The toolbar above a list.
 *
 * It is deliberately *not* a card. Every list page used to stack two raised
 * white boxes — one holding four inputs, one holding the rows they filter —
 * which reads as two unrelated panels and spends a whole elevation step on a
 * control strip. Filters belong to the list they filter, so this renders as a
 * sunken band inside the same card, above the table: one object, with its
 * controls recessed into the top of it.
 *
 * A GET form, so the filters live in the URL and a filtered list can be
 * bookmarked, shared and reloaded.
 */
export function FilterBar<T extends string>({
  /** Where "clear" goes back to — this page with no query at all. */
  action,
  /** Whether anything is currently filtering. Controls the clear button. */
  active,
  submitLabel,
  clearLabel,
  className,
  children,
}: {
  action: Route<T>;
  active: boolean;
  submitLabel: string;
  clearLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={cn(
        "flex flex-col gap-3 border-b border-border bg-surface-sunken px-4 py-3",
        className,
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        {/* Only offered once there is something to clear. A permanently
            visible reset on an unfiltered list is a control that does
            nothing, and the user has to read it to find that out. */}
        {active ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={action}>
              <X className="size-4" aria-hidden />
              {clearLabel}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * One labelled control.
 *
 * The label is always rendered — a placeholder standing in for a label
 * disappears the moment somebody types, which is exactly when they need to
 * check what they typed it into.
 */
export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function FilterInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, controlBorder, className)} {...props} />;
}

/** A checkbox and its label on one line, spanning the strip. */
export function FilterCheck({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" className={controlCheckbox} {...props} />
      {label}
    </label>
  );
}
