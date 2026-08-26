"use client";

/**
 * The last resort: the root layout itself failed.
 *
 * This replaces the whole document, which means the layout is gone and with it
 * the locale provider *and* the stylesheet — `globals.css` is imported by the
 * root layout, so no token, no utility class and no font is available here.
 * Everything is therefore inline, and the two languages are both printed
 * rather than chosen: the thing that knows which one this user reads is the
 * component that just failed.
 *
 * A reload rather than `reset()`: if the root layout threw, re-rendering it is
 * the operation that just went wrong.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="bn">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f3f5f3",
          color: "#0e1512",
          fontFamily:
            '"Noto Sans Bengali", "Inter", ui-sans-serif, system-ui, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <main
          style={{
            maxWidth: "26rem",
            width: "100%",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #dee3df",
            borderRadius: "12px",
            padding: "32px 24px",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: "1.125rem", fontWeight: 650 }}>
            অ্যাপটি খোলা যায়নি
          </h1>
          <p style={{ margin: "0 0 4px", fontSize: "0.9375rem", color: "#565b68" }}>
            সাময়িক একটি সমস্যা হয়েছে। পাতাটি আবার লোড করুন।
          </p>
          <p style={{ margin: "0 0 20px", fontSize: "0.875rem", color: "#6b707d" }}>
            HishabAI could not start. Please reload the page.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              cursor: "pointer",
              height: "44px",
              padding: "0 20px",
              border: "none",
              borderRadius: "8px",
              background: "#00c853",
              color: "#04220f",
              fontSize: "0.9375rem",
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            আবার চেষ্টা করুন · Reload
          </button>

          {error.digest ? (
            <p style={{ margin: "16px 0 0", fontSize: "0.75rem", color: "#6b707d" }}>
              রেফারেন্স · Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
