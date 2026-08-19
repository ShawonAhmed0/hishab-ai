import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
import { ToastProvider } from "@/components/ui/toast";
import { currentLocale, dict } from "@/lib/locale.server";
import { THEME_BOOTSTRAP, THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await dict();

  return {
    // The name and the tagline are the brand and stay put; only the sentence
    // a search result would show is translated.
    title: {
      default: `HishabAI — ${t.shell.tagline}`,
      template: "%s · HishabAI",
    },
    description: t.shell.appDescription,
  };
}

/**
 * The browser chrome has to match the page, including when the user has
 * overruled their OS. A static media pair cannot know about the cookie, so
 * once a theme is chosen this collapses to the one colour that is true.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return {
    width: "device-width",
    initialScale: 1,
    // No maximum-scale: pinch-zoom stays available. Bengali readers use it.
    themeColor:
      theme === null
        ? [
            { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
            { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
          ]
        : theme === "dark"
          ? "#0b1120"
          : "#f6f8fb",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A chosen theme is rendered by the server so there is no flash; with no
  // choice stored, the inline script below asks the OS before first paint.
  // The locale needs no such script — there is no OS setting to consult, and
  // the server renders the text itself.
  const [theme, locale] = await Promise.all([
    cookies().then((c) => parseTheme(c.get(THEME_COOKIE)?.value)),
    currentLocale(),
  ]);

  return (
    <html
      lang={locale}
      className={theme === "dark" ? "dark" : undefined}
      suppressHydrationWarning
    >
      <head>
        {theme === null ? (
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        ) : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Noto Sans Bengali for text, Inter for figures — see MASTER.md. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@100..900&family=Inter:wght@400..700&display=swap"
        />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
