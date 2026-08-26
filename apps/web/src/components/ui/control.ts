/**
 * What a form control looks like, in one place.
 *
 * `field.tsx` is `"use client"` — it has to be, it carries context and the
 * wheel handler — so a server component that wants an input matching the rest
 * of the app cannot import from it without dragging the whole module across
 * the boundary. Every list page's filter bar therefore hand-rolled its own
 * `h-11 rounded-md border border-border-strong …`, four copies that had already
 * drifted: the search boxes had no placeholder colour, the selects had the
 * native arrow rather than the themed one, and none of them had a hover state.
 *
 * This file is plain strings and no React, so both sides can have it.
 */

export const controlBase = [
  "h-11 w-full rounded-md border bg-surface px-3 text-base text-foreground",
  "placeholder:text-subtle-foreground",
  // A recess, per --shadow-control.
  "shadow-control",
  // Colour and the ring, nothing that moves the box.
  "transition-[color,background-color,border-color,box-shadow] duration-150",
  // A field answers the pointer before it is clicked. Without this the only
  // feedback a control gives is the focus ring, which arrives after the commit.
  "hover:border-subtle-foreground",
  // The ring is the accessible signal; the border turning brand is what makes
  // the field itself look active rather than merely outlined.
  "focus-visible:border-primary",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 disabled:shadow-none",
].join(" ");

/** The resting border. Split out because an errored field replaces it. */
export const controlBorder = "border-border-strong";

/** `<select>`, which draws its own chevron via `.select-chevron`. */
export const controlSelect = "select-chevron cursor-pointer appearance-none pr-9";

/**
 * A checkbox that matches. `accent-color` is the only way to tint the native
 * control, and the native control is the one that already announces itself
 * correctly to a screen reader.
 */
export const controlCheckbox =
  "size-4 shrink-0 cursor-pointer rounded-sm accent-[var(--color-primary)]";
