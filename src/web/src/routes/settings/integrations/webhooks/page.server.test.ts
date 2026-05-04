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
