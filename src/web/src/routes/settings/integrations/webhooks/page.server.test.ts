import { describe, test, expect, afterEach } from "bun:test";

// Tests for notify-webhook gate on integrations/webhooks page.

describe("/settings/integrations/webhooks — isNotifyWebhookEnabled()", () => {
  const orig = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;
  });

  test("isNotifyWebhookEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod.isNotifyWebhookEnabled()).toBe(false);
  });

  test("isNotifyWebhookEnabled ON with FULCRUM_FEATURES=notify-webhook", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod.isNotifyWebhookEnabled()).toBe(true);
  });

  test("isNotifyWebhookEnabled ON when mixed", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth,notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod.isNotifyWebhookEnabled()).toBe(true);
  });

  test("load throws 404 when notify-webhook OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let status: number | undefined;
    try {
      await mod.load({ locals: { session: { userId: "u1" } } });
    } catch (e: unknown) {
      const err = e as { status?: number };
      status = err.status;
    }
    expect(status).toBe(404);
  });

  test("load returns subscriptions and deliveries when notify-webhook ON", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let result: unknown;
    try {
      result = await mod.load({ locals: { session: { userId: "u1" } } });
    } catch {
      // noop
    }
    const r = result as { subscriptions: unknown[]; deliveries: unknown[] };
    expect(Array.isArray(r.subscriptions)).toBe(true);
    expect(Array.isArray(r.deliveries)).toBe(true);
  });

  test("mapWebhookDeliveries returns debug metadata without secrets", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    const rows = mod.mapWebhookDeliveries([
      {
        id: "delivery-1",
        eventType: "artifact.created",
        status: "retrying",
        attempt: 2,
        responseCode: 503,
        responseBodyExcerpt: "service unavailable",
        error: "HTTP 503",
        nextRetryAt: "2026-05-05T12:01:00.000Z",
        createdAt: "2026-05-05T12:00:00.000Z",
        signingSecret: "webhook-secret",
        smtpPassword: "smtp-secret",
        vapidPrivateKey: "push-secret",
      },
    ]);

    expect(rows[0]).toMatchObject({
      id: "delivery-1",
      event: "artifact.created",
      deliveryStatus: "retrying",
      attempts: 2,
      responseCode: 503,
      responseBodyExcerpt: "service unavailable",
      errorCode: "delivery_error",
      errorMessage: "HTTP 503",
      nextRetryAt: "2026-05-05T12:01:00.000Z",
    });
    expect(JSON.stringify(rows)).not.toContain("webhook-secret");
    expect(JSON.stringify(rows)).not.toContain("smtp-secret");
    expect(JSON.stringify(rows)).not.toContain("push-secret");
  });

  test("addSubscription / getSubscriptions round-trip", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    const before = mod.getSubscriptions().length;
    mod.addSubscription({
      id: "test-id",
      url: "https://example.com/hook",
      eventPattern: "task.*",
      signingSecret: "secret",
      createdAt: new Date().toISOString(),
    });
    expect(mod.getSubscriptions().length).toBe(before + 1);
    const found = mod.getSubscriptions().find((s: { id: string }) => s.id === "test-id");
    expect(found).toBeTruthy();
    expect(found?.url).toBe("https://example.com/hook");
  });
});
