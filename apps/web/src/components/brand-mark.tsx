import type { SVGProps } from "react";

type BrandMarkSvgProps = Omit<
  SVGProps<SVGSVGElement>,
  "aria-hidden" | "aria-label" | "children" | "focusable" | "role"
>;

export type BrandMarkProps = BrandMarkSvgProps &
  (
    | { decorative?: true; label?: never }
    | { decorative: false; label: string }
  );

/**
 * HishabAI's H monogram: paired ledger columns joined by the brass lines of a
 * balanced double-entry account. It defaults to decorative because the mark
 * is normally shown beside the product name.
 */
export function BrandMark({
  className,
  decorative = true,
  label,
  ...svgProps
}: BrandMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="32"
      height="32"
      fill="none"
      className={className}
      {...svgProps}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#06703A" />
      <path
        d="M16.5 15.5C16.5 14.67 17.17 14 18 14h6c.83 0 1.5.67 1.5 1.5v33c0 .83-.67 1.5-1.5 1.5h-6c-.83 0-1.5-.67-1.5-1.5v-33ZM38.5 15.5c0-.83.67-1.5 1.5-1.5h6c.83 0 1.5.67 1.5 1.5v33c0 .83-.67 1.5-1.5 1.5h-6c-.83 0-1.5-.67-1.5-1.5v-33Z"
        fill="#F7F4EA"
      />
      <path
        d="M22 25.5c0-.83.67-1.5 1.5-1.5h17c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-17c-.83 0-1.5-.67-1.5-1.5v-2ZM22 36.5c0-.83.67-1.5 1.5-1.5h17c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-17c-.83 0-1.5-.67-1.5-1.5v-2Z"
        fill="#E0A441"
      />
    </svg>
  );
}
