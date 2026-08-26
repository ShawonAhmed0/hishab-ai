"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * The two things somebody at a counter does two hundred times a day.
 *
 * This app had no keyboard affordance at all: every new sale meant reaching
 * for the pointer and crossing the screen to a button, and every lookup meant
 * the same trip to the search box. For a tool that is open from morning to
 * close, that is the whole speed ceiling.
 *
 *   ⌘K / Ctrl+K, or /   → the search box
 *   N                   → নতুন এন্ট্রি
 *
 * Deliberately two. A shortcut nobody can remember is a keystroke that
 * surprises them instead, so this covers the two destinations that account for
 * nearly every navigation and leaves the rest to the sidebar.
 */
export function Shortcuts() {
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never steal a key from something the user is typing into. `isContentEditable`
      // covers the rich fields; `closest` covers a click landing on a label or an
      // icon inside a control.
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      // A modal owns the keyboard while it is open — the override PIN dialog
      // is the case that matters, since "n" there is a digit somebody meant.
      if (document.querySelector("[role='dialog'][data-state='open']")) return;

      const search = () => {
        event.preventDefault();
        const box = document.getElementById("global-search") as HTMLInputElement | null;
        // The box is hidden on phones, where there is a whole page for it.
        if (box) {
          box.focus();
          box.select();
        } else {
          router.push("/search");
        }
      };

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        search();
        return;
      }

      // Bare keys only past this point: Ctrl+N is the browser's new window and
      // Alt+N may be a menu, and taking either would be rude.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        search();
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/entry");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}

/**
 * The hint inside the search box.
 *
 * A shortcut nobody is told about is a shortcut nobody uses, and the search
 * box is the one place it can be shown without adding a row of chrome. Hidden
 * from assistive tech: it is a picture of a key, and the keyboard user it
 * describes is the one who already found it.
 */
export function SearchHint() {
  const [mac, setMac] = React.useState(false);

  // Read on the client only. The platform is not knowable while rendering on
  // the server, and guessing it produces a hydration mismatch on every load.
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform ?? ""));
  }, []);

  return (
    <kbd
      aria-hidden
      className="num pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border-strong px-1.5 py-0.5 text-[0.6875rem] font-medium text-subtle-foreground sm:block"
    >
      {mac ? "⌘K" : "Ctrl K"}
    </kbd>
  );
}
