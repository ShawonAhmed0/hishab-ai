"use client";

import type * as React from "react";
import { controlBase, controlBorder, controlSelect } from "./control";
import { cn } from "@/lib/utils";

/**
 * The filter bar's `<select>`.
 *
 * Client-only for one reason: spec R4.5. A focused `<select>` changes its
 * value when the wheel passes over it, so scrolling down a list page after
 * setting a filter silently re-filters it. `field.tsx` fixed that for the
 * entry form and the list pages kept their own raw `<select>`, which is how a
 * fixed bug stays live three screens away.
 */
export function FilterSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      onWheel={(event) => {
        if (document.activeElement === event.currentTarget) event.currentTarget.blur();
      }}
      className={cn(controlBase, controlBorder, controlSelect, className)}
      {...props}
    >
      {children}
    </select>
  );
}
