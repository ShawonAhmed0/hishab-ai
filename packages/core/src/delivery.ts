/**
 * WhatsApp delivery — spec R4.6.
 *
 * ## The transaction boundary, which pulls both ways
 *
 * The spec says delivery is *outside* the posting transaction and must never
 * roll back or block an entry. That is half the rule. The other half is the
 * one `recordPostingWarnings` already follows: a message claiming a sale was
 * recorded must not go out when the sale rolled back.
 *
 * So the two halves are split.
 *
 *   - **Queueing is inside** the posting transaction. A row in
 *     `message_deliveries` is written next to the journal lines, and if the
 *     entry is refused the row disappears with it. Nothing has been sent yet,
 *     so nothing has to be unsent.
 *   - **Sending is after the commit**, and cannot touch it. `flushDeliveries`
 *     opens its own transaction, never throws, and returns a report instead of
 *     an error. Meta being down leaves rows `pending` for the next flush; it
 *     cannot prevent a sale from being recorded.
 *
 * ## Nothing is sent without credentials, and nothing piles up either
 *
 * With `WHATSAPP_*` unset the transport is inert: rows are marked `skipped`
 * with the reason, rather than left pending. A backlog of "your order was
 * recorded" messages delivered three weeks late, on the day somebody finally
 * pastes in a token, would be worse than never sending them. The log still
 * shows every message the app wanted to send and why it did not.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { messageDeliveries, withTenant, type Transaction as Tx } from "@hishabai/db";
import {
  DEFAULT_LOCALE,
  renderTemplate,
  toE164,
  WHATSAPP_LANGUAGE,
  WHATSAPP_TEMPLATES,
  type Locale,
  type WhatsAppTemplateKey,
} from "@hishabai/shared";
import type { Session, TenantScope } from "./session";

/**
 * How many times one message is tried before it is given up on.
 *
 * Three, and they are spread across flushes rather than looped here: a message
 * whose recipient has blocked the business fails identically every time, and
 * hammering it three times in a row inside one request buys nothing.
 */
export const MAX_ATTEMPTS = 3;

/** How many rows one flush will attempt, so a backlog cannot stall a request. */
const FLUSH_BATCH = 25;

export interface DeliveryRequest {
  template: WhatsAppTemplateKey;
  /** The recipient's own language, not the sender's. */
  locale?: Locale;
  /** Whatever is in the database — normalised here, or the row is skipped. */
  phone: string | null | undefined;
  params: readonly string[];
  entityType?: string;
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Queueing — inside the posting transaction
// ---------------------------------------------------------------------------

/**
 * Writes the rows. Called with the posting transaction, deliberately.
 *
 * A request whose phone number cannot be made sense of is still written, as
 * `skipped` with the reason on it. Dropping it silently would leave the admin
 * asking why a customer never heard anything, and the answer — "the number in
 * their record is not a number" — is exactly what the log is for.
 */
export async function queueDeliveries(
  tx: Tx,
  session: Session,
  requests: readonly DeliveryRequest[],
): Promise<void> {
  if (requests.length === 0) return;

  const rows = requests.map((request) => {
    const locale = request.locale ?? DEFAULT_LOCALE;
    const recipient = toE164(request.phone);
    const params = [...request.params];

    return {
      companyId: session.companyId,
      channel: "whatsapp" as const,
      template: request.template,
      locale,
      // `recipient` is not null-able: a row with nowhere to go still records
      // what was in the field, so the admin can see what to fix.
      recipient: recipient ?? "",
      params,
      preview: renderTemplate(request.template, locale, params),
      status: recipient ? ("pending" as const) : ("skipped" as const),
      ...(recipient ? {} : { lastError: "no usable phone number" }),
      ...(request.entityType ? { entityType: request.entityType } : {}),
      ...(request.entityId ? { entityId: request.entityId } : {}),
    };
  });

  await tx.insert(messageDeliveries).values(rows);
}

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

export interface OutboundMessage {
  to: string;
  templateName: string;
  language: string;
  params: readonly string[];
}

export interface WhatsAppTransport {
  /** False when the credentials are absent; the flush then skips rather than retries. */
  readonly configured: boolean;
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

/** Sends nothing, and says so. The default when `WHATSAPP_*` is unset. */
export function inertTransport(): WhatsAppTransport {
  return {
    configured: false,
    async send() {
      throw new Error("whatsapp transport is not configured");
    },
  };
}

export interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Graph API version, e.g. "v21.0". */
  apiVersion: string;
}

/** Reads the config out of the environment, or null when it is not all there. */
export function cloudApiConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): CloudApiConfig | null {
  const phoneNumberId = env["WHATSAPP_PHONE_NUMBER_ID"];
  const accessToken = env["WHATSAPP_ACCESS_TOKEN"];
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    apiVersion: env["WHATSAPP_API_VERSION"] ?? "v21.0",
  };
}

/**
 * Meta's WhatsApp Cloud API.
 *
 * A template send, never free text: outside a 24-hour customer service window
 * Meta rejects anything else, and this app messages people who have not
 * written to it.
 */
export function cloudApiTransport(
  config: CloudApiConfig,
  fetchImpl: typeof fetch = fetch,
): WhatsAppTransport {
  return {
    configured: true,
    async send(message) {
      const response = await fetchImpl(
        `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.to,
            type: "template",
            template: {
              name: message.templateName,
              language: { code: message.language },
              components: [
                {
                  type: "body",
                  parameters: message.params.map((text) => ({ type: "text", text })),
                },
              ],
            },
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      } | null;

      if (!response.ok) {
        // Meta's own message is far more useful than the status code; keep it,
        // because it is what ends up in last_error for somebody to read.
        const detail = body?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`whatsapp send failed: ${detail}`);
      }

      return { providerMessageId: body?.messages?.[0]?.id ?? "" };
    },
  };
}

/** The transport this process will use, decided once from the environment. */
export function defaultTransport(): WhatsAppTransport {
  const config = cloudApiConfigFromEnv();
  return config ? cloudApiTransport(config) : inertTransport();
}

// ---------------------------------------------------------------------------
// Sending — after the commit
// ---------------------------------------------------------------------------

export interface DeliveryReport {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Sends what is queued. **Never throws.**
 *
 * That is the whole contract. It runs after the posting transaction has
 * committed, so by the time anything here can go wrong the entry is already
 * safe, and an exception escaping would turn a WhatsApp outage into a failed
 * save on the user's screen for an entry that was in fact recorded.
 */
export async function flushDeliveries(
  scope: TenantScope,
  transport: WhatsAppTransport = defaultTransport(),
): Promise<DeliveryReport> {
  const report: DeliveryReport = { attempted: 0, sent: 0, failed: 0, skipped: 0 };

  try {
    const pending = await withTenant(scope, (tx) =>
      tx
        .select()
        .from(messageDeliveries)
        .where(
          and(
            eq(messageDeliveries.companyId, scope.companyId),
            eq(messageDeliveries.status, "pending"),
          ),
        )
        .orderBy(asc(messageDeliveries.createdAt))
        .limit(FLUSH_BATCH),
    );

    if (pending.length === 0) return report;

    // No credentials: mark the batch rather than leaving it to pile up and be
    // delivered weeks late the day somebody pastes in a token.
    if (!transport.configured) {
      await withTenant(scope, (tx) =>
        tx
          .update(messageDeliveries)
          .set({ status: "skipped", lastError: "whatsapp is not configured" })
          .where(
            and(
              eq(messageDeliveries.companyId, scope.companyId),
              inArray(
                messageDeliveries.id,
                pending.map((row) => row.id),
              ),
            ),
          ),
      );
      report.skipped = pending.length;
      return report;
    }

    for (const row of pending) {
      report.attempted += 1;
      const attempts = row.attempts + 1;
      const template = WHATSAPP_TEMPLATES[row.template as WhatsAppTemplateKey];

      try {
        if (!template) throw new Error(`unknown template ${row.template}`);

        const { providerMessageId } = await transport.send({
          to: row.recipient,
          templateName: template.name,
          language: WHATSAPP_LANGUAGE[row.locale as Locale] ?? WHATSAPP_LANGUAGE.bn,
          params: (row.params as string[]) ?? [],
        });

        await withTenant(scope, (tx) =>
          tx
            .update(messageDeliveries)
            .set({
              status: "sent",
              attempts,
              providerMessageId,
              sentAt: new Date(),
              lastError: null,
            })
            .where(eq(messageDeliveries.id, row.id)),
        );
        report.sent += 1;
      } catch (error) {
        // Terminal only once the cap is reached. Below it the row stays
        // pending and the next flush picks it up — which is the retry.
        const exhausted = attempts >= MAX_ATTEMPTS;
        await withTenant(scope, (tx) =>
          tx
            .update(messageDeliveries)
            .set({
              status: exhausted ? "failed" : "pending",
              attempts,
              lastError: error instanceof Error ? error.message : String(error),
            })
            .where(eq(messageDeliveries.id, row.id)),
        );
        if (exhausted) report.failed += 1;
      }
    }

    return report;
  } catch {
    // The queue itself could not be read or written. There is nothing useful
    // to do about it here and absolutely nothing worth throwing at a caller
    // whose entry has already been saved.
    return report;
  }
}

/** What the delivery log shows, newest first. */
export async function listDeliveries(
  scope: TenantScope,
  limit = 50,
): Promise<(typeof messageDeliveries.$inferSelect)[]> {
  return withTenant(scope, (tx) =>
    tx
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.companyId, scope.companyId))
      .orderBy(sql`${messageDeliveries.createdAt} desc`)
      .limit(limit),
  );
}
