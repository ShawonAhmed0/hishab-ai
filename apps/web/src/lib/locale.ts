/**
 * Where the chosen language lives.
 *
 * Its own module because the cookie name is needed on both sides: the server
 * reads it in the root layout, and the switcher writes it in the browser. The
 * value is validated on the way in — an unvalidated cookie once made every
 * page 500 unrecoverably, because the bad value was sent back on each retry
 * (see the `hishabai_company` note in CLAUDE.md).
 */
export const LOCALE_COOKIE = "hishabai_locale";

/** A year. Long enough that the choice feels permanent; not a session cookie. */
export const LOCALE_COOKIE_MAX_AGE = 31536000;
