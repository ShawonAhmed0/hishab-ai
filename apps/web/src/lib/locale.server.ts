import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDictionary, parseLocale, type Dictionary, type Locale } from "@hishabai/shared";
import { LOCALE_COOKIE } from "./locale";

/**
 * The locale for this request.
 *
 * Anything that is not a locale we ship falls back to Bengali rather than
 * throwing: a malformed cookie must not be able to take the app down, and the
 * user cannot clear it from inside a page that will not render.
 */
export async function currentLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE;
}

/**
 * The dictionary for this request, for server components.
 *
 * Client components take theirs from `useT()` instead, which reads the same
 * locale out of context rather than re-reading the cookie.
 */
export async function dict(): Promise<Dictionary> {
  return getDictionary(await currentLocale());
}
