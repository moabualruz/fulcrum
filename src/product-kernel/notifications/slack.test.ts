import { describe, expect, test } from "bun:test";
import {
  sendSlackNotification,
  formatSlackBlockKit,
  type SlackFetch,
  type SendSlackInput,
} from "./slack.ts";

// --- Mock fetch ---

function mockFetch(status = 200, body = "ok"): SlackFetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return Object.assign(fn, { calls });
}

function rateLimitFetch(retryAfter = "1"): SlackFetch & { calls: { url: string }[] } {
  const calls: { url: string }[] = [];
  let callCount = 0;
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url });
    callCount++;
    if (callCount === 1) {
      return new Response("rate_limited", {
        status: 429,
        headers: { "Retry-After": retryAfter },
      });
    }
    return new Response("ok", { status: 200 });
  };
  return Object.assign(fn, { calls });
}

describe("Slack notification channel", () => {
  test("flag OFF → no fetch calls", async () => {
    const fetchImpl = mockFetch();
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Test",
      body: "Hello",
      featureEnabled: false,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("suppressed");
    expect(result.suppressionReason).toBe("feature_disabled");
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("flag ON → Block Kit POST sent to webhook URL", async () => {
    const fetchImpl = mockFetch();
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Deploy complete",
      body: "v1.2.3 shipped",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("sent");
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]!.url).toBe("https://hooks.slack.com/services/T00/B00/xxx");

    const payload = JSON.parse(fetchImpl.calls[0]!.init.body as string);
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks[0].type).toBe("section");
    expect(payload.blocks[0].text.type).toBe("mrkdwn");
    expect(payload.blocks[0].text.text).toContain("*Deploy complete*");
    expect(payload.blocks[0].text.text).toContain("v1.2.3 shipped");
  });

  test("quiet-hours → status=suppressed", async () => {
    const fetchImpl = mockFetch();
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      quietHoursActive: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("suppressed");
    expect(result.suppressionReason).toBe("quiet_hours");
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("HTTP error → status=failed + lastError", async () => {
    const fetchImpl = mockFetch(500, "internal_error");
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("HTTP 500: internal_error");
  });

  test("fetch throws → status=failed", async () => {
    const fetchImpl: SlackFetch = async () => {
      throw new Error("network timeout");
    };
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("network timeout");
  });

  test("rate-limit 429 → exponential backoff retry", async () => {
    const fetchImpl = rateLimitFetch("0");
    const result = await sendSlackNotification({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    // Should retry after 429 and succeed on second attempt
    expect(result.status).toBe("sent");
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test("formatSlackBlockKit produces valid Block Kit JSON", () => {
    const blocks = formatSlackBlockKit("Title", "Body text");
    expect(blocks).toEqual({
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: "*Title*\nBody text" },
      }],
    });
  });

  test("missing webhook URL → status=failed", async () => {
    const fetchImpl = mockFetch();
    const result = await sendSlackNotification({
      webhookUrl: "",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toContain("webhook URL");
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
