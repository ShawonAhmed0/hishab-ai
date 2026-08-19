"use client";

/**
 * The modal every "are you sure?" goes through.
 *
 * One component rather than a dialog per screen, so the focus handling, the
 * Escape key and the scroll lock are got right once — spec R4.2 asks for a
 * single confirmation mechanism, and this is the shell it renders in.
 *
 * Radix owns the behaviour; this file owns the look and the two rules that
 * matter for a blocking dialog: it does not close on a click outside, and it
 * does not close on Escape, because both are how a shopkeeper dismisses a
 * refusal by accident and assumes the entry saved.
 */
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** A refusal the user has to act on, rather than a question they may wave away. */
  blocking?: boolean;
  closeLabel: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  blocking = false,
  closeLabel,
  children,
  footer,
}: DialogProps) {
  const dismiss = React.useCallback(
    (event: Event) => {
      if (blocking) event.preventDefault();
    },
    [blocking],
  );

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <RadixDialog.Content
          onEscapeKeyDown={dismiss}
          onPointerDownOutside={dismiss}
          onInteractOutside={dismiss}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border bg-surface shadow-card",
            "max-h-[calc(100vh-2rem)] overflow-y-auto",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
            <RadixDialog.Close
              className="-m-1 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
              aria-label={closeLabel}
            >
              <X className="size-4" aria-hidden />
            </RadixDialog.Close>
          </div>

          {description ? (
            <RadixDialog.Description asChild>
              <div className="px-4 pt-3 text-sm text-muted-foreground">{description}</div>
            </RadixDialog.Description>
          ) : null}

          {children ? <div className="space-y-3 p-4">{children}</div> : null}
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
