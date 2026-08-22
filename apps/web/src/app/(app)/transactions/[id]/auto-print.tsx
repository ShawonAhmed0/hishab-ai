"use client";

import * as React from "react";

/**
 * Opens the browser's print dialog once, on arrival.
 *
 * The receipt R4.4 asks for is this page — the same layout the shop already
 * reads on screen, rather than a second one that could quietly disagree with
 * it about a total. Landing here with `?print=1` is what "Print receipt" in
 * the success dialog does.
 *
 * Guarded with a ref because React runs effects twice in development, and two
 * print dialogs stacked on each other is a thing you have to dismiss twice.
 */
export function AutoPrint() {
  const printed = React.useRef(false);

  React.useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    // After paint: printing a half-rendered page prints a half-rendered page.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
