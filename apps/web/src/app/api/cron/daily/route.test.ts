import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The job itself is covered by the integration suite. What is covered here is
 * the door — and it is worth its own tests because behind it is an endpoint
 * that messages every customer of every company on the instance.
 *
 * `runDailyJobs` is mocked so no test can reach a database or a phone, and so
 * "did the door open?" is answerable by whether it was called at all.
 */
const runDailyJobs = vi.hoisted(() => vi.fn());
vi.mock("@hishabai/core", () => ({ runDailyJobs }));

import { GET } from "./route";

const SECRET = "correct-horse-battery-staple";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/daily", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("the daily cron endpoint", () => {
  const original = process.env["CRON_SECRET"];

  beforeEach(() => {
    runDailyJobs.mockReset();
    runDailyJobs.mockResolvedValue({ companies: 2, queued: 3, sent: 3, failures: [] });
    process.env["CRON_SECRET"] = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env["CRON_SECRET"];
    else process.env["CRON_SECRET"] = original;
  });

  it("runs the jobs and reports what happened", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      companies: 2,
      queued: 3,
      sent: 3,
      failures: [],
    });
    expect(runDailyJobs).toHaveBeenCalledOnce();
  });

  it("answers 200 even when some companies failed", async () => {
    // A non-2xx would have Vercel retry the whole run, including the companies
    // that already got their summary. The failures go in the body instead.
    runDailyJobs.mockResolvedValue({
      companies: 1,
      queued: 1,
      sent: 1,
      failures: [{ companyId: "abc", error: "boom" }],
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect((await response.json()).failures).toHaveLength(1);
  });

  describe("refuses, without running anything", () => {
    /** The assertion that matters in every case below. */
    async function refused(response: Response, status: number) {
      expect(response.status).toBe(status);
      expect(runDailyJobs).not.toHaveBeenCalled();
    }

    it("fails closed when no secret is configured", async () => {
      // Not "allow everything" and not "run unauthenticated". An open endpoint
      // that messages every customer is not something to leave to obscurity.
      delete process.env["CRON_SECRET"];
      await refused(await GET(request("Bearer anything")), 503);
    });

    it("rejects a missing Authorization header", async () => {
      await refused(await GET(request()), 401);
    });

    it("rejects an empty Authorization header", async () => {
      await refused(await GET(request("")), 401);
    });

    it("rejects the right token under the wrong scheme", async () => {
      await refused(await GET(request(`Basic ${SECRET}`)), 401);
    });

    it("rejects a wrong token of the same length", async () => {
      const sameLength = "x".repeat(SECRET.length);
      expect(sameLength).toHaveLength(SECRET.length);
      await refused(await GET(request(`Bearer ${sameLength}`)), 401);
    });

    /**
     * `timingSafeEqual` throws when the two buffers differ in length, which
     * without the length check ahead of it turns a short token into a 500 —
     * and a 500 is a different, louder answer than a 401, which is itself a
     * signal about the secret.
     */
    it("rejects a shorter token as 401, not 500", async () => {
      await refused(await GET(request("Bearer short")), 401);
    });

    it("rejects a longer token as 401, not 500", async () => {
      await refused(await GET(request(`Bearer ${SECRET}-and-then-some`)), 401);
    });

    it("rejects a bare Bearer with nothing after it", async () => {
      await refused(await GET(request("Bearer ")), 401);
    });
  });
});
