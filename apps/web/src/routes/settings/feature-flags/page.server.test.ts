import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { actions, load } from "./+page.server.js";

// `/settings/feature-flags/+page.server.ts` is a pure invocation layer: it
// builds a feature-flags public-API client via `createFeatureFlagsApiForEvent`
// and delegates load + every action to `/api/v1/feature-flags/settings/*`.
// This suite drives the route through a fake `event.fetch` (plus
// `FULCRUM_SERVER_URL` so the client has a base URL) — no `mock.module`, so
// sibling settings suites are never hijacked.
const SERVER_URL = "http://127.0.0.1:4319";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];

beforeEach(() => {
  process.env["FULCRUM_SERVER_URL"] = SERVER_URL;
});

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
});

// A fake feature-flags public API. Records each call; returns `{ success: true }`
// for mutations and a flag list for `GET /settings`.
function fetchFeatureFlags(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${method} ${url.pathname}${body ? ` ${JSON.stringify(body)}` : ""}`);

    if (url.pathname === "/api/v1/feature-flags/settings" && method === "GET") {
      return Response.json({ flags: [] });
    }
    if (/\/api\/v1\/feature-flags\/settings\/[^/]+\/(toggle|rollout|cohort-rules)$/.test(url.pathname)) {
      return Response.json({ success: true });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

function actionEvent(fetchImpl: typeof fetch, body: Record<string, string>) {
  const url = new URL("http://localhost/settings/feature-flags");
  const fd = new FormData();
  for (const [key, value] of Object.entries(body)) fd.set(key, value);
  return {
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { method: "POST", body: fd, headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof actions.toggle>[0];
}

describe("/settings/feature-flags actions", () => {
  test("load streams the feature flags the public API returns", async () => {
    const calls: string[] = [];
    const url = new URL("http://localhost/settings/feature-flags");
    const result = await load({
      url,
      locals: { orgId: "org-1", userId: "user-1" },
      fetch: fetchFeatureFlags(calls),
      request: new Request(url),
    } as unknown as Parameters<typeof load>[0]);
    const data = await (result as { streamed: { data: Promise<unknown> } }).streamed.data;
    expect(data).toEqual({ flags: [] });
    expect(calls).toEqual(["GET /api/v1/feature-flags/settings"]);
  });

  test("toggle: requires id", async () => {
    const result = await actions.toggle(actionEvent(fetchFeatureFlags(), {}));
    expect(result).toMatchObject({ status: 400 });
  });

  test("toggle: delegates to the settings toggle endpoint", async () => {
    const calls: string[] = [];
    const result = await actions.toggle(actionEvent(fetchFeatureFlags(calls), { id: "flag-1" }));
    expect(result).toMatchObject({ success: true });
    expect(calls[0]).toContain("PATCH /api/v1/feature-flags/settings/flag-1/toggle");
  });

  test("setRollout: rejects invalid percent", async () => {
    const result = await actions.setRollout(actionEvent(fetchFeatureFlags(), { id: "flag-1", rollout_percent: "150" }));
    expect(result).toMatchObject({ status: 400 });
  });

  test("setRollout: delegates rollout_percent to the settings rollout endpoint", async () => {
    const calls: string[] = [];
    const result = await actions.setRollout(actionEvent(fetchFeatureFlags(calls), { id: "flag-1", rollout_percent: "50" }));
    expect(result).toMatchObject({ success: true });
    expect(calls[0]).toContain("PATCH /api/v1/feature-flags/settings/flag-1/rollout");
    expect(calls[0]).toContain('"rolloutPercent":50');
  });

  test("setCohortRules: rejects invalid JSON", async () => {
    const result = await actions.setCohortRules(actionEvent(fetchFeatureFlags(), { id: "flag-1", cohort_rules: "notjson" }));
    expect(result).toMatchObject({ status: 400 });
  });

  test("setCohortRules: delegates parsed rules to the settings cohort-rules endpoint", async () => {
    const calls: string[] = [];
    const result = await actions.setCohortRules(
      actionEvent(fetchFeatureFlags(calls), { id: "flag-1", cohort_rules: '{"users":["alice"]}' }),
    );
    expect(result).toMatchObject({ success: true });
    expect(calls[0]).toContain("PATCH /api/v1/feature-flags/settings/flag-1/cohort-rules");
    expect(calls[0]).toContain('"users":["alice"]');
  });
});
