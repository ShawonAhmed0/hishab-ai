/**
 * Calling a server action without letting the network take the page down.
 *
 * Every action in this app already catches its own failures and returns a
 * result — `EntryResult`, `CreateResult`, and so on. What none of them can
 * catch is the call never arriving: a dropped connection, a request that times
 * out, a deploy landing mid-submit, a response that fails to deserialize. In
 * those cases the promise the client awaited *rejects*.
 *
 * That rejection used to escape. Inside `startTransition` React hands an
 * unhandled rejection to the nearest error boundary, and there were none, so
 * it reached the root and replaced the whole page — taking with it the
 * twelve-line sale the shopkeeper had just typed, with no message and nothing
 * to retry. On a counter in Dhaka on patchy mobile data that is not an edge
 * case, it is Tuesday.
 *
 * `attempt` turns that throw into a value the caller has to look at. The
 * tuple is deliberate: a caller that ignores the failure has to write the
 * variable and leave it unused, which is visible in review, where a forgotten
 * `.catch()` is not.
 */
export type Attempted<T> = readonly [T, null] | readonly [null, TransportFailure];

export interface TransportFailure {
  /** True when the browser itself knows it is offline — worth saying so. */
  offline: boolean;
  /** For the log and the "reference" line; never shown as prose. */
  detail: string;
}

export async function attempt<T>(run: () => Promise<T>): Promise<Attempted<T>> {
  try {
    return [await run(), null] as const;
  } catch (error) {
    // `navigator.onLine` false is conclusive; true means little, so it only
    // ever upgrades the message, never suppresses it.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const detail = error instanceof Error ? error.message : String(error);
    // The server has its own logs; this is the half of the failure that only
    // ever happens in somebody's browser.
    console.error("[hishabai] action transport failed", error);
    return [null, { offline, detail }] as const;
  }
}
