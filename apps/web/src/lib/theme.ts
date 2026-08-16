export const THEME_COOKIE = "hishabai_theme";

export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}

/**
 * Applies the OS setting when the user has never chosen.
 *
 * Runs before first paint, which is the only way to avoid rendering the light
 * theme and then repainting dark. `suppressHydrationWarning` on `<html>` is
 * what lets this differ from the server's markup without React complaining.
 */
export const THEME_BOOTSTRAP = `try{if(matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e){}`;
