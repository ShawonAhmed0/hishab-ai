"use client";

import { Printer } from "lucide-react";
import { Button } from "./button";

/**
 * Printing is how a বকেয়া বিবরণী becomes a PDF here.
 *
 * Every browser's print dialog offers "Save as PDF", so the statement is one
 * click from a file the shop can send or keep — without shipping a PDF library
 * and a second layout that could disagree with what is on screen. The print
 * stylesheet in globals.css strips the chrome; `.no-print` hides this button
 * from the page it produces.
 */
export function PrintButton({ label = "প্রিন্ট / PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">
      <Printer className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
