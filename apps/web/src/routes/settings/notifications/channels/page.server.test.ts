import { describe, expect, test } from "bun:test";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ result: { data: { json: data } } }), {
    headers: { "content-type": "application/json" },
  });
}

describe("/settings/notifications/channels +page.server", () => {
  test("saveWebhook action masks secret before returning channel state", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const { actions } = await import("./+page.server.ts");
    const form = new FormData();
    form.set("url", "https://hooks.example.test/fulcrum");
    form.set("secret", "abcd1234supersecret");

    const result = await actions.saveWebhook({
      locals: { session: { user: { id: "user1" } } },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ ok: true });
      },
      request: { headers: new Headers({ cookie: "sid=test" }), formData: async () => form },
      url: new URL("http://localhost/settings/notifications/channels"),
    } as any);

    expect(calls[0]!.url).toContain("/api/trpc/notify.channels.config");
    expect(JSON.parse(String(calls[0]!.init!.body)).json).toEqual({
      channel: "webhook",
      enabled: true,
      url: "https://hooks.example.test/fulcrum",
      secret: "abcd1234supersecret",
    });
    expect(result).toEqual({ ok: true, webhookSecretMasked: "abcd***" });
  });
});
