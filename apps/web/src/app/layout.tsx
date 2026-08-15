import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
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
