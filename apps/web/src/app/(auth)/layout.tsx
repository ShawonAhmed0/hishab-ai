import type { CSSProperties } from "react";
import { BrandMark } from "@/components/brand-mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { dict } from "@/lib/locale.server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await dict();

  return (
    <div className="min-h-dvh bg-background p-2 sm:p-3 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)] lg:gap-3">
      <aside className="auth-visual hidden min-h-[calc(100dvh-1.5rem)] flex-col rounded-[1.75rem] p-8 text-white lg:flex xl:p-12">
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" decorative />
          <div>
            <p className="text-lg font-bold tracking-[-0.025em]">HishabAI</p>
            <p className="text-xs text-white/65">{t.shell.tagline}</p>
          </div>
        </div>

        <div className="my-auto max-w-xl py-8 xl:py-14">
          <p className="mb-5 flex items-center gap-2 text-sm font-medium text-[#f0bb63]">
            <span className="h-px w-8 bg-[#f0bb63]/70" aria-hidden />
            {t.shell.motto}
          </p>
          <h1 className="max-w-[14ch] text-3xl font-semibold leading-[1.18] tracking-[-0.035em] text-balance xl:text-5xl">
            {t.shell.appDescription}
          </h1>

          {/* A compact, abstract ledger rather than a product screenshot. It
              tells the same story in both locales and never becomes stale. */}
          <div
            className="mt-7 max-w-lg rounded-2xl border border-white/12 bg-white/[0.075] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_50px_-28px_rgba(0,0,0,0.65)] backdrop-blur-md xl:mt-10"
            aria-hidden
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <span className="block h-2 w-20 rounded-full bg-white/20" />
                <span className="num mt-3 block text-2xl font-semibold text-white">
                  ৳1,28,450.00
                </span>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-[#f0bb63]/15 text-sm font-semibold text-[#f0bb63]">
                +18
              </span>
            </div>
            <div className="mt-5 flex h-20 items-end gap-2 xl:h-24">
              {[42, 58, 48, 76, 64, 88, 72, 96].map((height, index) => (
                <span
                  key={height}
                  className="auth-ledger-line min-w-0 flex-1 rounded-t bg-white/18"
                  style={{
                    height: `${height}%`,
                    "--ledger-delay": `${index * 55}ms`,
                  } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="max-w-md text-sm leading-relaxed text-white/65">{t.shell.tagline}</p>
      </aside>

      <main className="relative flex min-h-[calc(100dvh-1rem)] items-center justify-center px-3 py-20 sm:min-h-[calc(100dvh-1.5rem)] sm:px-8 lg:py-16">
        <div className="absolute right-2 top-2 flex items-center rounded-xl border border-border bg-surface/80 p-0.5 shadow-card backdrop-blur sm:right-4 sm:top-4">
          <LocaleToggle />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <div className="mb-7 flex flex-col items-center gap-2 text-center lg:hidden">
            <BrandMark className="size-12" decorative />
            <h1 className="text-2xl font-bold tracking-[-0.025em]">HishabAI</h1>
            <p className="text-sm text-muted-foreground">{t.shell.tagline}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
