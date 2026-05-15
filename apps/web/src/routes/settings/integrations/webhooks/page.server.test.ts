import { afterEach, describe, expect, test } from "bun:test";

const originalFeatures = process.env["FULCRUM_FEATURES"];
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const forbiddenTransportPath = "/api/" + "tr" + "pc";

afterEach(() => {
  restoreEnv("FULCRUM_FEATURES", originalFeatures);
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
});

describe("/settings/integrations/webhooks", () => {
  test("isNotifyWebhookEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isNotifyWebhookEnabled()).toBe(false);
  });

  test("isNotifyWebhookEnabled ON with FULCRUM_FEATURES=notify-webhook", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    expect(mod._isNotifyWebhookEnabled()).toBe(true);
  });

  test("isNotifyWebhookEnabled ON when mixed", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth,notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    expect(mod._isNotifyWebhookEnabled()).toBe(true);
  });

  test("load throws 404 when notify-webhook is off", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    let status: number | undefined;
    try {
      await mod.load({
        locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: new Headers() },
        url: new URL("http://localhost/settings/integrations/webhooks"),
      });
    } catch (e: unknown) {
      status = (e as { status?: number }).status;
    }
    expect(status).toBe(404);
  });

  test("load uses notification and webhook public APIs", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);

    const result = await mod.load({
      locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init });
        if (target.includes("/api/v1/notifications/rules")) {
          return Response.json([
            { id: "rule-1", name: "Webhook task", channels: ["webhook"] },
            { id: "rule-2", name: "Email task", channels: ["email"] },
          ]);
        }
        if (target.includes("/api/v1/notifications/settings")) {
          return Response.json({
            channels: [{ name: "webhook", enabled: true, configurable: true }],
          });
        }
        if (target.includes("/api/v1/webhooks/endpoint-1/deliveries")) {
          return Response.json([
            {
              id: "delivery-1",
              eventId: "event-1",
              status: "failed",
              attempt: 2,
              responseCode: 503,
              error: "service unavailable",
              nextRetryAt: "2026-05-14T12:00:00.000Z",
              createdAt: "2026-05-14T11:00:00.000Z",
            },
          ]);
        }
        if (target.includes("/api/v1/webhooks?")) {
          return Response.json([{ id: "endpoint-1" }]);
        }
        throw new Error(`unexpected API path: ${target}`);
      },
      request: { headers: new Headers({ cookie: "sid=test" }) },
      url: new URL("http://localhost/settings/integrations/webhooks"),
    });

    expect(result.subscriptions).toEqual([{ id: "rule-1", name: "Webhook task", channels: ["webhook"] }]);
    expect(result.channels).toEqual([{ name: "webhook", enabled: true, configurable: true }]);
    expect(result.deliveries).toEqual([
      expect.objectContaining({
        id: "delivery-1",
        event: "event-1",
        deliveryStatus: "failed",
        attempts: 2,
        responseCode: 503,
        errorMessage: "service unavailable",
      }),
    ]);
    expect(calls.map((call) => [call.init?.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/rules?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/settings?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks?orgId=org-1&includeDisabled=true"],
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks/endpoint-1/deliveries?orgId=org-1&limit=25"],
    ]);
  });

  test("load fails closed when scoped API callers are unavailable", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    const mod = await import(`./+page.server.ts?t=${Date.now() + 5}`);
    let thrown: unknown;

    try {
      await mod.load({
        locals: { session: { userId: "u1" }, orgId: null, userId: "user-1" },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: new Headers() },
        url: new URL("http://localhost/settings/integrations/webhooks"),
      });
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; body?: { message?: string } }).status).toBe(503);
    expect((thrown as { status?: number; body?: { message?: string } }).body?.message).toBe(
      "Webhook settings API caller is not configured.",
    );
  });

  test("create uses public notification channel and rule endpoints", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    process.env["FULCRUM_PUBLIC_API_URL"] = "http://127.0.0.1:4321/api-base/";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mod = await import(`./+page.server.ts?t=${Date.now() + 6}`);
    const form = new FormData();
    form.set("url", "https://hooks.example.test/fulcrum");
    form.set("eventPattern", "task.*");
    form.set("signingSecret", "webhook-secret");

    const result = await mod.actions.create({
      locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init });
        if (target.includes("/api/v1/notifications/rules")) {
          return Response.json({ id: "rule-1" }, { status: 201 });
        }
        return Response.json({ ok: true });
      },
      request: { headers: new Headers({ cookie: "sid=test" }), formData: async () => form },
      url: new URL("http://localhost/settings/integrations/webhooks"),
    });

    expect(result).toEqual({ ok: true, id: "rule-1" });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/notifications/channels/webhook?orgId=org-1&userId=user-1",
        init: {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=test",
          },
          body: JSON.stringify({
            enabled: true,
            url: "https://hooks.example.test/fulcrum",
            secret: "webhook-secret",
          }),
        },
      },
      {
        url: "http://127.0.0.1:4321/api/v1/notifications/rules?orgId=org-1&userId=user-1",
        init: {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=test",
          },
          body: JSON.stringify({
            name: "Webhook task.*",
            eventPattern: { eventType: "task.*", deliveryMode: "immediate" },
            channels: ["webhook"],
            enabled: true,
          }),
        },
      },
    ]);
  });

  test("resend uses public webhook delivery endpoint", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mod = await import(`./+page.server.ts?t=${Date.now() + 7}`);
    const form = new FormData();
    form.set("deliveryId", "delivery-1");

    const result = await mod.actions.resend({
      locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init });
        return Response.json({ id: "delivery-1", status: "retrying" }, { status: 202 });
      },
      request: { headers: new Headers({ cookie: "sid=test" }), formData: async () => form },
      url: new URL("http://localhost/settings/integrations/webhooks"),
    });

    expect(result).toMatchObject({ ok: true, resend: { deliveryId: "delivery-1" } });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/webhooks/deliveries/delivery-1/resend?orgId=org-1",
        init: {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=test",
          },
          body: undefined,
        },
      },
    ]);
  });

  test("mapWebhookDeliveries returns debug metadata without secrets", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 8}`);
    const rows = mod._mapWebhookDeliveries([
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
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
