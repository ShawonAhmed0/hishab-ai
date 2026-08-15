import Link from "next/link";
import { Construction } from "lucide-react";
import { bn } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Placeholder for the sections that land in a later phase.
 *
 * A nav item that 404s is worse than one that says what it is waiting for, so
 * each of these names the work rather than apologising vaguely.
 */
export function ComingNext({
  title,
  summary,
  includes,
}: {
  title: string;
  summary: string;
  includes: string[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Construction className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-medium">পরবর্তী ধাপে আসছে</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
            </div>
          </div>

          <ul className="ml-1 space-y-1.5 text-sm text-muted-foreground">
            {includes.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-subtle-foreground">
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/entry">{bn.nav.newEntry}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">{bn.nav.dashboard}</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
