import { afterEach, describe, expect, test } from "bun:test";

import { actions, load } from "./+page.server.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
  if (originalPublicApiUrl === undefined) delete process.env["FULCRUM_PUBLIC_API_URL"];
  else process.env["FULCRUM_PUBLIC_API_URL"] = originalPublicApiUrl;
});

function loadEvent(fetchImpl: typeof fetch) {
  return {
    locals: { orgId: "org-1" },
    request: new Request("http://localhost/settings/notifications", {
      headers: { cookie: "sid=session-1" },
    }),
    fetch: fetchImpl,
    url: new URL("http://localhost/settings/notifications"),
  };
}

function actionEvent(fetchImpl: typeof fetch, retainDays: string) {
  const form = new FormData();
  form.set("retain_days", retainDays);
  return {
    locals: { orgId: "org-1" },
    request: {
      headers: new Headers({ cookie: "sid=session-1" }),
      formData: async () => form,
    },
    fetch: fetchImpl,
    url: new URL("http://localhost/settings/notifications"),
  };
}

describe("/settings/notifications public audit retention transport", () => {
  test("loads retention policy through the Nest public audit API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await load(loadEvent(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({
        id: "policy-1",
        orgId: "org-1",
        projectId: null,
        retainDays: 45,
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
      });
    }) as never);

    expect(result).toEqual({ retainDays: 45, saved: false });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/audit/retention-policy?orgId=org-1",
        init: {
          method: "GET",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
          body: undefined,
        },
      },
    ]);
  });

  test("saves retention policy through the Nest public audit API", async () => {
    process.env["FULCRUM_PUBLIC_API_URL"] = "http://127.0.0.1:4321/api-base/";
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const event = actionEvent(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({
        id: "policy-1",
        orgId: "org-1",
        projectId: null,
        retainDays: 90,
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
      });
    }, "90");
    const result = await actions.retention(event as never);

    expect(result).toEqual({ retainDays: 90, saved: true });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/audit/retention-policy?orgId=org-1",
        init: {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
          body: JSON.stringify({ retainDays: 90 }),
        },
      },
    ]);
  });

  test("defaults to same-origin public API and does not keep direct app-scope fallback", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();
    const calls: string[] = [];

    const result = await load(loadEvent(async (url: string | URL | Request) => {
      calls.push(String(url));
      return Response.json({ retainDays: 30 });
    }) as never);

    expect(result).toEqual({ retainDays: 30, saved: false });
    expect(calls).toEqual(["http://localhost/api/v1/audit/retention-policy?orgId=org-1"]);
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("getRetentionPolicy");
    expect(source).not.toContain("upsertRetentionPolicy");
  });
});
