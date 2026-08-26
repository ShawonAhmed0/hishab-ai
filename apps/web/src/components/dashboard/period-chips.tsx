import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export interface PeriodChoice {
  key: string;
  label: string;
  href: Route;
  active: boolean;
}

/**
 * The periods a shop asks for, one tap each.
 *
 * Two date inputs can express any range and make the four anybody actually
 * wants cost four taps and a chance to fumble one. These sit beside the inputs
 * rather than replacing them: the chips are the common case, the inputs are
 * everything else, and both put dates in the URL so a chosen period survives a
 * reload and can be sent to somebody.
 *
 * Real links, not buttons that push state. The range is already a URL, so the
 * browser's own back button is the undo.
 */
export function PeriodChips({
  choices,
  label,
  className,
}: {
  choices: readonly PeriodChoice[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {choices.map((choice) => (
        <Link
          key={choice.key}
          href={choice.href}
          aria-current={choice.active ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            choice.active
              ? "border-primary bg-primary text-on-primary"
              : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {choice.label}
        </Link>
      ))}
    </nav>
  );
}
