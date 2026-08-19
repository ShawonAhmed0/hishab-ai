"use client";

import * as React from "react";
import { DEFAULT_LOCALE, getDictionary, type Dictionary, type Locale } from "@hishabai/shared";

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

/**
 * Carries the server's decision down to client components.
 *
 * Both dictionaries are static objects that are already in the bundle, so this
 * passes the *locale*, not the strings — there is nothing to fetch and nothing
 * to serialise beyond two characters.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

export function useT(): Dictionary {
  return getDictionary(React.useContext(LocaleContext));
}
