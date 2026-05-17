/**
 * Discord notification channel — gated behind FULCRUM_FEATURES=notify-discord.
 *
 * Sends embed JSON to a Discord webhook URL.
 * Rate-limit 429 → exponential backoff with retry (Discord returns retry_after in body).
 * Quiet-hours respected via caller-supplied flag.
 */

// --- Types ---

export type DiscordFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Discord blurple color as decimal. */
export const DISCORD_EMBED_COLOR = 0x5865F2;

export interface SendDiscordInput {
  webhookUrl: string;
  title: string;
  body: string;
  featureEnabled: boolean;
  quietHoursActive?: boolean;
  fetch?: DiscordFetch;
  maxRetries?: number;
}

export interface DiscordDeliveryResult {
  status: "sent" | "failed" | "suppressed";
  suppressionReason?: string;
  lastError?: string;
  attemptCount: number;
}

// --- Embed formatter ---

export function formatDiscordEmbed(title: string, body: string): Record<string, unknown> {
  return {
    embeds: [{
      title,
      description: body,
      color: DISCORD_EMBED_COLOR,
    }],
  };
}

// --- Core send ---

const MAX_RETRIES_DEFAULT = 3;
const MAX_BACKOFF_MS = 32_000;

function backoffMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * 1_000, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendDiscordNotification(input: SendDiscordInput): Promise<DiscordDeliveryResult> {
  // Feature gate
  if (!input.featureEnabled) {
    return { status: "suppressed", suppressionReason: "feature_disabled", attemptCount: 0 };
  }

  // Quiet hours
  if (input.quietHoursActive) {
    return { status: "suppressed", suppressionReason: "quiet_hours", attemptCount: 0 };
  }

  // Validate URL
  if (!input.webhookUrl) {
    return { status: "failed", lastError: "Missing webhook URL", attemptCount: 0 };
  }

  const fetchImpl = input.fetch ?? globalThis.fetch;
  const maxRetries = input.maxRetries ?? MAX_RETRIES_DEFAULT;
  const payload = JSON.stringify(formatDiscordEmbed(input.title, input.body));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(input.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      // Discord returns 204 No Content on success
      if (response.status >= 200 && response.status < 300) {
        return { status: "sent", attemptCount: attempt };
      }

      // Rate limit — Discord includes retry_after in JSON body
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterMs = await parseDiscordRetryAfter(response);
        await sleep(retryAfterMs > 0 ? retryAfterMs : backoffMs(attempt));
        continue;
      }

      const responseText = await response.text().catch(() => "");
      return {
        status: "failed",
        lastError: `HTTP ${response.status}: ${responseText}`,
        attemptCount: attempt,
      };
    } catch (err) {
      if (attempt >= maxRetries) {
        return {
          status: "failed",
          lastError: err instanceof Error ? err.message : String(err),
          attemptCount: attempt,
        };
      }
      await sleep(backoffMs(attempt));
    }
  }

  return { status: "failed", lastError: "Max retries exhausted", attemptCount: maxRetries };
}

async function parseDiscordRetryAfter(response: Response): Promise<number> {
  try {
    const body = await response.json() as { retry_after?: number };
    if (typeof body.retry_after === "number") {
      return body.retry_after * 1_000; // seconds → ms
    }
  } catch {
    // fall through
  }
  // Fallback to Retry-After header
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = parseFloat(header);
    if (!isNaN(seconds)) return seconds * 1_000;
  }
  return 0;
}
