"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  show: (toast: Omit<Toast, "id">) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE = {
  success: { icon: CheckCircle2, className: "border-credit bg-credit-soft text-credit" },
  error: { icon: AlertCircle, className: "border-debit bg-debit-soft text-debit" },
  info: { icon: Info, className: "border-info bg-info-soft text-info" },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current, { ...toast, id }]);
      // Errors stay until dismissed; a confirmation can leave on its own.
      if (toast.tone !== "error") {
        setTimeout(() => dismiss(id), 4000);
      }
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ tone: "success", title, ...(body ? { body } : {}) }),
      error: (title, body) => show({ tone: "error", title, ...(body ? { body } : {}) }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Polite, not assertive: a save confirmation should not interrupt what
        // a screen reader is in the middle of saying.
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => {
          const { icon: Icon, className } = TONE[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                "stack-fade pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-overlay",
                className,
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{toast.title}</p>
                {toast.body ? <p className="mt-0.5 text-sm opacity-90">{toast.body}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="বন্ধ করুন"
                className="cursor-pointer rounded p-1 hover:bg-black/5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
