/**
 * Slack notification channel — gated behind FULCRUM_FEATURES=notify-slack.
 *
 * Sends Block Kit JSON to a Slack incoming webhook URL.
 * Rate-limit 429 → exponential backoff with retry.
 * Quiet-hours respected via caller-supplied flag.
 */

// --- Types ---

export type SlackFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SendSlackInput {
  webhookUrl: string;
  title: string;
  body: string;
  featureEnabled: boolean;
  quietHoursActive?: boolean;
  fetch?: SlackFetch;
  maxRetries?: number;
}

export interface SlackDeliveryResult {
  status: "sent" | "failed" | "suppressed";
  suppressionReason?: string;
  lastError?: string;
  attemptCount: number;
}

// --- Block Kit formatter ---

export function formatSlackBlockKit(title: string, body: string): Record<string, unknown> {
  return {
    blocks: [{
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*\n${body}` },
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

export async function sendSlackNotification(input: SendSlackInput): Promise<SlackDeliveryResult> {
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
  const payload = JSON.stringify(formatSlackBlockKit(input.title, input.body));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(input.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      if (response.status >= 200 && response.status < 300) {
        return { status: "sent", attemptCount: attempt };
      }

      // Rate limit — retry with backoff
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseRetryAfter(response);
        await sleep(retryAfter > 0 ? retryAfter : backoffMs(attempt));
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

function parseRetryAfter(response: Response): number {
  const header = response.headers.get("Retry-After");
  if (!header) return 0;
  const seconds = parseFloat(header);
  return isNaN(seconds) ? 0 : seconds * 1_000;
}
