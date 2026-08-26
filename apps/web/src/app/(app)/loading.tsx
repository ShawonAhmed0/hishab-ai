import { Card, CardBody, CardHeader } from "@/components/ui/card";

/**
 * What every route shows while its data is on the way.
 *
 * There were none of these, so a tap on ইনভেন্টরি did nothing visible until
 * the server answered — on a slow connection that is several seconds of a
 * screen that looks broken, and the usual response is to tap again. App Router
 * renders this the instant the navigation starts.
 *
 * It is shaped like the pages it stands in for — a title, a toolbar, rows —
 * rather than a spinner, so the layout does not jump when the real thing
 * lands. `aria-busy` and a live region carry the same news to a screen
 * reader, which cannot see a pulsing rectangle.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only" role="status">
        লোড হচ্ছে…
      </span>

      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-surface-sunken" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-sunken" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardBody className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
              <div className="h-8 w-32 animate-pulse rounded-md bg-surface-sunken" />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="h-5 w-40 animate-pulse rounded bg-surface-sunken" />
        </CardHeader>
        <CardBody className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 flex-1 animate-pulse rounded bg-surface-sunken" />
              <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
