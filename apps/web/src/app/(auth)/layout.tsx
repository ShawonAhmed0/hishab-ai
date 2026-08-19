import { Wallet } from "lucide-react";
import { dict } from "@/lib/locale.server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await dict();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Wallet className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">HishabAI</h1>
          <p className="text-sm text-muted-foreground">
            {t.shell.tagline}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
