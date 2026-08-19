"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { localeName, type Locale } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale-provider";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/locale";

/**
 * Two locales, so a toggle rather than a menu — the button names the language
 * you would get, not the one you are in.
 *
 * Unlike the theme, this cannot be finished in the browser. Most of the text
 * on any page was rendered on the server, so flipping a class would leave the
 * shell in one language and the table under it in the other. The cookie is
 * written first and `router.refresh()` re-renders the server tree with it,
 * which is also what feeds the new locale back into this component's context.
 */
export function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const next: Locale = locale === "bn" ? "en" : "bn";

  function switchTo() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={switchTo}
      disabled={pending}
      // The full name, not the two-letter code: "EN" beside a Bengali page is
      // a guess about what the button does.
      aria-label={localeName[next]}
      title={localeName[next]}
    >
      <Languages className="size-5" aria-hidden />
      <span className="sr-only">{localeName[next]}</span>
    </Button>
  );
}
