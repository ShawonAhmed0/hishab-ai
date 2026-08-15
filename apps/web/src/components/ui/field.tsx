"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Form field plumbing.
 *
 * The highest-severity form rules in the UX set are all about errors being
 * findable: a visible label (never a placeholder standing in for one), the
 * message next to the field it belongs to, and `aria-describedby` wiring so a
 * screen reader reads the error as part of the field. All of that is done
 * here once rather than remembered at each of the forty inputs.
 */

interface FieldContext {
  id: string;
  errorId: string;
  hintId: string;
  hasError: boolean;
  hasHint: boolean;
}

const Ctx = React.createContext<FieldContext | null>(null);

function useField(): FieldContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("Field parts must be used inside <Field>");
  return ctx;
}

export function Field({
  children,
  error,
  hint,
  className,
}: {
  children: React.ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
}) {
  const id = React.useId();
  const value = React.useMemo<FieldContext>(
    () => ({
      id,
      errorId: `${id}-error`,
      hintId: `${id}-hint`,
      hasError: Boolean(error),
      hasHint: Boolean(hint),
    }),
    [id, error, hint],
  );

  return (
    <Ctx.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {children}
        {hint && !error ? (
          <p id={value.hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={value.errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs text-debit"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

export function FieldLabel({
  children,
  required,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  const { id } = useField();
  return (
    <label htmlFor={id} className={cn("text-sm font-medium text-foreground", className)}>
      {children}
      {required ? (
        <span className="ml-0.5 text-debit" aria-label="আবশ্যক">
          *
        </span>
      ) : null}
    </label>
  );
}

const controlClass = [
  "h-11 w-full rounded-md border bg-surface px-3 text-base text-foreground",
  "placeholder:text-subtle-foreground",
  "transition-colors duration-150",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60",
].join(" ");

function describedBy(ctx: FieldContext): string | undefined {
  const ids = [ctx.hasError ? ctx.errorId : null, ctx.hasHint && !ctx.hasError ? ctx.hintId : null]
    .filter(Boolean)
    .join(" ");
  return ids || undefined;
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => {
  const ctx = useField();
  return (
    <input
      ref={ref}
      id={ctx.id}
      aria-invalid={ctx.hasError || undefined}
      aria-describedby={describedBy(ctx)}
      // Amount fields get the numeric keypad and tabular figures, but stay
      // type="text" so Bengali digits and commas are not rejected by the browser.
      inputMode={numeric ? "decimal" : undefined}
      className={cn(
        controlClass,
        ctx.hasError ? "border-debit" : "border-border-strong",
        numeric && "num text-right",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  const ctx = useField();
  return (
    <textarea
      ref={ref}
      id={ctx.id}
      aria-invalid={ctx.hasError || undefined}
      aria-describedby={describedBy(ctx)}
      className={cn(
        controlClass,
        "h-auto min-h-20 py-2",
        ctx.hasError ? "border-debit" : "border-border-strong",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  const ctx = useField();
  return (
    <select
      ref={ref}
      id={ctx.id}
      aria-invalid={ctx.hasError || undefined}
      aria-describedby={describedBy(ctx)}
      className={cn(
        controlClass,
        "cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        ctx.hasError ? "border-debit" : "border-border-strong",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23526074' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

/**
 * The error summary that sits at the top of a failed submit.
 *
 * Focus moves here once, on submit — not on every blur — and each item links
 * to the field it came from so a keyboard user can jump straight to it.
 */
export function ErrorSummary({
  title,
  errors,
}: {
  title: string;
  errors: { fieldId: string; message: string }[];
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (errors.length > 0) ref.current?.focus();
  }, [errors]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-debit bg-debit-soft p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-debit"
    >
      <h2 className="flex items-center gap-2 font-semibold text-debit">
        <AlertCircle className="size-4" aria-hidden />
        {title}
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {errors.map((error) => (
          <li key={`${error.fieldId}-${error.message}`}>
            <a
              href={`#${error.fieldId}`}
              className="text-debit underline underline-offset-2 hover:no-underline"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
