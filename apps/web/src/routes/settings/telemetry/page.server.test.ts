import { describe, expect, test } from "bun:test";

function telemetryEvent(fetch: typeof globalThis.fetch, locals: Partial<App.Locals> = {}) {
  const url = new URL("http://localhost/settings/telemetry");
  return {
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      em: null,
      container: null,
      ...locals,
    },
    fetch,
    request: new Request(url, {
      headers: { cookie: "sid=session-1" },
    }),
    url,
  };
}

describe("/settings/telemetry route", () => {
  test("loads telemetry status through the public telemetry API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return Response.json({ opted_in: false, row_count: 7 });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?telemetry-load=${Date.now()}`);

    const data = await mod.load(telemetryEvent(fetch) as never);
    await expect(data.streamed.data).resolves.toEqual({ optIn: false, rowCount: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/telemetry/status?orgId=org-1&userId=user-1");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
  });

  test("toggleOptIn reads current status and posts the opposite state", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).includes("/status")) return Response.json({ optIn: true, rowCount: 3 });
      return Response.json({ ok: true });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?telemetry-toggle=${Date.now()}`);

    // The action now also persists local consent and returns that snapshot
    // alongside the toggled state — assert the toggled state via `toMatchObject`
    // and verify the persisted consent mirrors the new opt-in value.
    const result = await mod.actions.toggleOptIn(telemetryEvent(fetch) as never);
    expect(result).toMatchObject({ success: true, optIn: false });
    expect((result as { local: { consent: { optedIn: boolean } } }).local.consent.optedIn).toBe(false);
    expect(calls.map((call) => [call.init?.method, call.url, call.init?.body ? JSON.parse(String(call.init.body)) : null])).toEqual([
      ["GET", "http://localhost/api/v1/telemetry/status?orgId=org-1&userId=user-1", null],
      ["POST", "http://localhost/api/v1/telemetry/opt-out", { orgId: "org-1", userId: "user-1" }],
    ]);
  });

  test("purge deletes telemetry events through the public telemetry API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return Response.json({ ok: true, deleted: 7 });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?telemetry-purge=${Date.now()}`);

    await expect(mod.actions.purge(telemetryEvent(fetch) as never)).resolves.toEqual({
      success: true,
      rowCount: 7,
    });
    expect(calls.map((call) => [call.init?.method, call.url])).toEqual([
      ["DELETE", "http://localhost/api/v1/telemetry/events?orgId=org-1&userId=user-1"],
    ]);
  });

  test("route source does not use direct app scope or settings commands", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("getSettingsTelemetry");
    expect(source).not.toContain("toggleSettingsTelemetryOptIn");
    expect(source).not.toContain("purgeSettingsTelemetry");
  });
});
