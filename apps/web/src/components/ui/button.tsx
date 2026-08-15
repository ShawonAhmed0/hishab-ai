import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "font-medium transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    // Every clickable thing says so.
    "cursor-pointer",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-card hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-surface text-foreground hover:bg-surface-sunken",
        ghost: "text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
        accent: "bg-accent text-on-accent hover:brightness-95",
        destructive: "bg-destructive text-on-destructive hover:brightness-95",
      },
      size: {
        // 44px minimum on md and up — those are the sizes that meet a thumb.
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base",
        lg: "h-12 px-6 text-lg",
        icon: "size-11",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild, loading, children, disabled, ...props },
    ref,
  ) => {
    // Slot renders *into* its single child, so it cannot also receive a
    // spinner sibling. asChild buttons are links, which never load anyway.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(button({ variant, size, block }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(button({ variant, size, block }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
