import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_BOOTSTRAP, THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HishabAI — Smart হিসাব, Smarter Business",
    template: "%s · HishabAI",
  },
  description:
    "বাংলায় ব্যবসার সম্পূর্ণ হিসাব — একবার লিখুন, বাকিটা HishabAI করবে।",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximum-scale: pinch-zoom stays available. Bengali readers use it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A chosen theme is rendered by the server so there is no flash; with no
  // choice stored, the inline script below asks the OS before first paint.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="bn"
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
