"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * The switch the dark palette was written for.
 *
 * `globals.css` has carried a complete dark theme — some forty re-pointed
 * tokens, with credit and debit hues lifted to clear 4.5:1 on a dark surface —
 * since the beginning, and nothing ever put `.dark` on the page. It was
 * unreachable: no toggle, and no `prefers-color-scheme` fallback either.
 *
 * The class is flipped here rather than through a server round trip, because
 * the paint should happen on the click. The cookie is only so the server can
 * render the right class next time and avoid a flash of the wrong theme.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  // The class is already correct before hydration — set by the server from the
  // cookie, or by the inline script from the OS setting. This only catches up
  // with whichever of them won.
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "দিনের রঙে দেখুন" : "রাতের রঙে দেখুন"}
      aria-pressed={dark}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </Button>
  );
}
