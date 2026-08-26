import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { dict } from "@/lib/locale.server";

/**
 * A wrong link, or a voucher somebody deleted before this tab was refreshed.
 *
 * Inside the (app) group so it keeps the shell — a 404 in this product is
 * almost always a stale link to a real thing, and the useful next move is one
 * of the ones already in the sidebar.
 */
export default async function AppNotFound() {
  const t = await dict();

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-subtle-foreground">
          <SearchX className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold">{t.errors.notFoundTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.errors.notFoundBody}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard">{t.errors.backToDashboard}</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
