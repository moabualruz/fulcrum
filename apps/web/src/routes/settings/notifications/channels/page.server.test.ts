import { afterEach, describe, expect, test } from "bun:test";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const forbiddenTransportPath = "/api/" + "tr" + "pc";

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
});

describe("/settings/notifications/channels +page.server", () => {
  test("load uses notification public API endpoints from the current origin by default", async () => {
    delete process.env["FULCRUM_SERVER_URL"];
    delete process.env["FULCRUM_PUBLIC_API_URL"];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const { load } = await import(`./+page.server.ts?t=${Date.now()}`);

    const result = await load({
      locals: { session: { user: { id: "user-1" } }, orgId: "org-1", userId: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init });
        if (target.startsWith("http://localhost/api/v1/notifications/settings")) {
          return Response.json({ channels: [{ name: "in-app", enabled: true, configurable: false }] });
        }
        if (target.startsWith("http://localhost/api/v1/notifications/rules")) {
          return Response.json([{ id: "rule-1", name: "Review", enabled: true, channels: ["in-app"] }]);
        }
        if (target.startsWith("http://localhost/api/v1/notifications/quiet-hours")) {
          return Response.json({ id: "quiet-1", tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] });
        }
        throw new Error(`unexpected API path: ${target}`);
      },
      request: { headers: new Headers({ cookie: "sid=test" }) },
      url: new URL("http://localhost/settings/notifications/channels"),
    } as any);

    expect(result).toEqual({
      channels: [{ name: "in-app", enabled: true, configurable: false }],
      rules: [{ id: "rule-1", name: "Review", enabled: true, channels: ["in-app"] }],
      quietHours: { id: "quiet-1", tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] },
    });
    expect(calls.map((call) => [call.init?.method, call.url])).toEqual([
      ["GET", "http://localhost/api/v1/notifications/settings?orgId=org-1&userId=user-1"],
      ["GET", "http://localhost/api/v1/notifications/rules?orgId=org-1&userId=user-1"],
      ["GET", "http://localhost/api/v1/notifications/quiet-hours?orgId=org-1&userId=user-1"],
    ]);
  });

  test("load fails closed when scoped API callers are unavailable", async () => {
    const { load } = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    let thrown: unknown;

    try {
      await load({
        locals: { session: { user: { id: "user-1" } }, orgId: null, userId: "user-1" },
        fetch: async () => {
          throw new Error("unexpected API call");
        },
        request: { headers: new Headers() },
        url: new URL("http://localhost/settings/notifications/channels"),
      } as any);
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number; body?: { message?: string } }).status).toBe(503);
    expect((thrown as { status?: number; body?: { message?: string } }).body?.message).toBe(
      "Notification API caller is not configured.",
    );
  });

  test("saveWebhook masks the secret and writes through the notification public API", async () => {
    process.env["FULCRUM_PUBLIC_API_URL"] = "http://127.0.0.1:4321/api-base/";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const { actions } = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const form = new FormData();
    form.set("url", "https://hooks.example.test/fulcrum");
    form.set("secret", "abcd1234supersecret");

    const result = await actions.saveWebhook({
      locals: { session: { user: { id: "user1" } }, orgId: "org-1", userId: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init });
        return Response.json({ ok: true });
      },
      request: { headers: new Headers({ cookie: "sid=test" }), formData: async () => form },
      url: new URL("http://localhost/settings/notifications/channels"),
    } as any);

    expect(result).toEqual({ ok: true, webhookSecretMasked: "abcd***" });
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
            secret: "abcd1234supersecret",
          }),
        },
      },
    ]);
  });

  test("saveWebhook fails before an API call when scope is missing", async () => {
    const { actions } = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const form = new FormData();
    form.set("url", "https://hooks.example.test/fulcrum");
    form.set("secret", "abcd1234supersecret");

    const result = await actions.saveWebhook({
      locals: { session: { user: { id: "user1" } }, orgId: null, userId: "user-1" },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: { headers: new Headers(), formData: async () => form },
      url: new URL("http://localhost/settings/notifications/channels"),
    } as any);

    expect(result).toMatchObject({
      status: 400,
      data: { channelError: "Notification API caller is not configured." },
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
