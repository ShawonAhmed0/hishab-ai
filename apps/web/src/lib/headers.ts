/**
 * The id of the user the middleware verified, handed down to the page.
 *
 * This lives on its own rather than in `middleware.ts` because importing a
 * constant from there drags the whole module — and `@supabase/ssr` with it —
 * into the server bundle of every page that wants to read the header.
 */
export const VERIFIED_USER_HEADER = "x-hishabai-verified-user";
