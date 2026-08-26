import { cn } from "@/lib/utils";

/**
 * The shape of the last few months, in the width of a caption.
 *
 * A KPI states one number; the sparkline says whether that number is the top
 * of a climb or the bottom of a slide, which is the question the figure
 * immediately raises and which a delta chip alone cannot answer — "12% up"
 * reads very differently after five falling months than after five rising
 * ones.
 *
 * It draws itself on mount: `pathLength="1"` normalises any geometry to a unit
 * length, so one CSS keyframe animates every sparkline regardless of its
 * shape. Measuring the path in JS is the usual way to do this and it cannot
 * happen here — this renders on the server.
 *
 * No axes, no ticks, no tooltip. Every figure it summarises is stated exactly
 * elsewhere on the page, and a chart this size that invites reading values off
 * it is lying about its own precision.
 */
export function Spark({
  values,
  /** Unique per instance — SVG gradient ids are global to the document. */
  id,
  className,
  delayMs = 0,
}: {
  values: readonly number[];
  id: string;
  className?: string;
  delayMs?: number;
}) {
  // Two points make a line; one makes a dot that implies a trend it does not
  // have. Below that, draw nothing rather than something meaningless.
  if (values.length < 2) return null;

  const W = 100;
  const H = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and, worse, would render as a line
  // pinned to the top of the box. Flat belongs in the middle.
  const span = max - min || 1;
  const flat = max === min;

  // Inset on the right so the marker on the last point has room. At x = W it
  // sits exactly on the card's edge, and the card clips its own overflow — so
  // the dot marking the figure the card states was rendered as a half-dot.
  const PAD = 3;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (W - PAD);
    const y = flat ? H / 2 : H - ((value - min) / span) * (H - 6) - 3;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${(W - PAD).toFixed(2)} ${H} L0 ${H} Z`;
  const last = points[points.length - 1] as readonly [number, number];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      // The box is a caption-height strip of whatever width it is given, so
      // the drawing has to stretch rather than letterbox inside it.
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      // Decorative: the trend is stated in words by the delta chip beside it.
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={area}
        fill={`url(#spark-${id})`}
        className="rise"
        style={{ "--rise-delay": `${delayMs + 250}ms` } as React.CSSProperties}
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength="1"
        className="draw"
        style={{ "--rise-delay": `${delayMs}ms` } as React.CSSProperties}
      />
      {/*
        Where the series ends is where the stated figure comes from.

        A zero-length subpath with a round cap, not a `<circle>`: this box is
        stretched non-uniformly (`preserveAspectRatio="none"` — it has to fill
        whatever width the card is), and under that transform a circle renders
        as a flattened ellipse. A round cap combined with `non-scaling-stroke`
        is measured in device pixels after the transform, so it stays a dot at
        any card width.
      */}
      <path
        d={`M${last[0].toFixed(2)} ${last[1].toFixed(2)} L${last[0].toFixed(2)} ${last[1].toFixed(2)}`}
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="rise"
        style={{ "--rise-delay": `${delayMs + 700}ms` } as React.CSSProperties}
      />
    </svg>
  );
}
