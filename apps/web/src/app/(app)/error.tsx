"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * What a shopkeeper sees when a page throws.
 *
 * Before this file existed they saw Next's own fallback: an English sentence
 * about a server-side exception, outside the app shell, with no navigation and
 * no way back — in a product whose entire premise is that the user never needs
 * to know what a ledger is, let alone what a digest is.
 *
 * It sits in the (app) group, so the sidebar and the top bar stay up and the
 * failure is one card on an otherwise working app rather than a dead end. The
 * digest is shown because it is the only thing that connects what they saw to
 * what the server logged, but it is labelled as a reference rather than
 * printed as if it meant something.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  React.useEffect(() => {
    console.error("[hishabai] route error", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-debit-soft text-debit">
          <AlertTriangle className="size-6" aria-hidden />
        </span>

        <div>
          <h1 className="text-lg font-semibold">{t.errors.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.errors.pageBody}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {/* `reset` re-renders the segment rather than reloading, so a
              transient read failure recovers without losing the shell. */}
          <Button onClick={reset} size="sm">
            <RotateCw className="size-4" aria-hidden />
            {t.errors.retry}
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/dashboard">{t.errors.backToDashboard}</Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="num text-xs text-subtle-foreground">
            {t.errors.reference(error.digest)}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
