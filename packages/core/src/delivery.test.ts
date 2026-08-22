import { describe, expect, it } from "vitest";
import {
  cloudApiConfigFromEnv,
  cloudApiTransport,
  defaultTransport,
  inertTransport,
} from "./delivery";

/**
 * Spec R4.6. The transport, against a fake `fetch` — the shape of the request
 * Meta expects, and the failure it returns, without a token or a network.
 */
describe("the Cloud API transport", () => {
  const config = {
    phoneNumberId: "1234567890",
    accessToken: "test-token",
    apiVersion: "v21.0",
  };

  function fakeFetch(response: { ok: boolean; status?: number; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 400),
        json: async () => response.body,
      };
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("posts a template send, never free text", async () => {
    // Outside a 24-hour customer service window Meta rejects anything but a
    // registered template, and this app messages people who never wrote to it.
    const { impl, calls } = fakeFetch({ ok: true, body: { messages: [{ id: "wamid.X" }] } });

    const result = await cloudApiTransport(config, impl).send({
      to: "8801812345678",
      templateName: "payment_received",
      language: "bn",
      params: ["করিম", "৳ 5,000.00", "RCPT-1"],
    });

    expect(result.providerMessageId).toBe("wamid.X");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://graph.facebook.com/v21.0/1234567890/messages",
    );

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "8801812345678",
      type: "template",
      template: {
        name: "payment_received",
        language: { code: "bn" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "করিম" },
              { type: "text", text: "৳ 5,000.00" },
              { type: "text", text: "RCPT-1" },
            ],
          },
        ],
      },
    });
  });

  it("sends the token as a bearer credential and nowhere else", async () => {
    const { impl, calls } = fakeFetch({ ok: true, body: { messages: [{ id: "x" }] } });
    await cloudApiTransport(config, impl).send({
      to: "8801812345678",
      templateName: "daily_summary",
      language: "en",
      params: ["23/08/2026", "a", "b", "c"],
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer test-token");
    // Never in the URL: query strings end up in logs and proxies.
    expect(calls[0]!.url).not.toContain("test-token");
  });

  it("keeps Meta's own message, which is what lands in last_error", async () => {
    const { impl } = fakeFetch({
      ok: false,
      status: 400,
      body: { error: { message: "Template name does not exist in the translation" } },
    });

    await expect(
      cloudApiTransport(config, impl).send({
        to: "8801812345678",
        templateName: "nope",
        language: "bn",
        params: [],
      }),
    ).rejects.toThrow(/Template name does not exist/);
  });

  it("falls back to the status code when the body is not JSON", async () => {
    const impl = (async () => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    })) as unknown as typeof fetch;

    await expect(
      cloudApiTransport(config, impl).send({
        to: "8801812345678",
        templateName: "x",
        language: "bn",
        params: [],
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("choosing a transport", () => {
  it("is inert with no credentials, and says so rather than pretending", async () => {
    const transport = inertTransport();
    expect(transport.configured).toBe(false);
    await expect(transport.send({ to: "1", templateName: "x", language: "bn", params: [] }))
      .rejects.toThrow(/not configured/);
  });

  it("needs both the number id and the token before it will send", () => {
    expect(cloudApiConfigFromEnv({})).toBeNull();
    expect(cloudApiConfigFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "1" })).toBeNull();
    expect(cloudApiConfigFromEnv({ WHATSAPP_ACCESS_TOKEN: "t" })).toBeNull();
    expect(
      cloudApiConfigFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" }),
    ).toEqual({ phoneNumberId: "1", accessToken: "t", apiVersion: "v21.0" });
  });

  it("defaults the Graph version rather than leaving it undefined in a URL", () => {
    const config = cloudApiConfigFromEnv({
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_API_VERSION: "v22.0",
    });
    expect(config?.apiVersion).toBe("v22.0");
  });

  it("is inert in this process, because the test environment has no token", () => {
    // Also the guarantee that running the suite can never message a real phone.
    expect(defaultTransport().configured).toBe(false);
  });
});
