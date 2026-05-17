import { describe, expect, test } from "bun:test";
import {
  sendDiscordNotification,
  formatDiscordEmbed,
  DISCORD_EMBED_COLOR,
  type DiscordFetch,
} from "./discord.ts";

// --- Mock fetch ---

function mockFetch(status = 204, body = ""): DiscordFetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return Object.assign(fn, { calls });
}

function rateLimitFetch(retryAfterMs = 100): DiscordFetch & { calls: { url: string }[] } {
  const calls: { url: string }[] = [];
  let callCount = 0;
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url });
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ retry_after: retryAfterMs / 1000 }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("", { status: 204 });
  };
  return Object.assign(fn, { calls });
}

describe("Discord notification channel", () => {
  test("flag OFF → no fetch calls", async () => {
    const fetchImpl = mockFetch();
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
      title: "Test",
      body: "Hello",
      featureEnabled: false,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("suppressed");
    expect(result.suppressionReason).toBe("feature_disabled");
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("flag ON → embed POST sent to webhook URL", async () => {
    const fetchImpl = mockFetch();
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
      title: "Deploy complete",
      body: "v1.2.3 shipped",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("sent");
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]!.url).toBe("https://discord.com/api/webhooks/123/abc");

    const payload = JSON.parse(fetchImpl.calls[0]!.init.body as string);
    expect(payload.embeds).toBeDefined();
    expect(payload.embeds[0].title).toBe("Deploy complete");
    expect(payload.embeds[0].description).toBe("v1.2.3 shipped");
    expect(payload.embeds[0].color).toBe(DISCORD_EMBED_COLOR);
  });

  test("quiet-hours → status=suppressed", async () => {
    const fetchImpl = mockFetch();
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
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
    const fetchImpl = mockFetch(500, "internal server error");
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("HTTP 500: internal server error");
  });

  test("fetch throws → status=failed", async () => {
    const fetchImpl: DiscordFetch = async () => {
      throw new Error("DNS failure");
    };
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("DNS failure");
  });

  test("rate-limit 429 → exponential backoff retry", async () => {
    const fetchImpl = rateLimitFetch(0);
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
      title: "Test",
      body: "Hello",
      featureEnabled: true,
      fetch: fetchImpl,
    });
    expect(result.status).toBe("sent");
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test("formatDiscordEmbed produces valid embed JSON", () => {
    const embed = formatDiscordEmbed("Title", "Body text");
    expect(embed).toEqual({
      embeds: [{
        title: "Title",
        description: "Body text",
        color: DISCORD_EMBED_COLOR,
      }],
    });
  });

  test("missing webhook URL → status=failed", async () => {
    const fetchImpl = mockFetch();
    const result = await sendDiscordNotification({
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
