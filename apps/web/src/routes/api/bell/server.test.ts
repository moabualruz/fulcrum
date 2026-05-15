import { describe, expect, test } from "bun:test";

import { GET } from "./+server.ts";

describe("/api/bell", () => {
  test("delegates unread-count retrieval through the local public API by default", async () => {
    const calls: RequestInit[] = [];
    const urls: string[] = [];
    const response = await GET({
      url: new URL("http://localhost/api/bell"),
      request: new Request("http://localhost/api/bell", {
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: "org-1", userId: "user-1" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        urls.push(String(url));
        calls.push(init ?? {});
        return Response.json({ count: 3 });
      },
    } as never);

    await expect(response.json()).resolves.toEqual({ count: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        cookie: "sid=session-1",
      },
    });
    expect(urls[0]).toBe("http://localhost/api/v1/notifications/unread-count?orgId=org-1&userId=user-1");
  });

  test("uses the Nest public notification endpoint when a server URL is configured", async () => {
    const original = process.env["FULCRUM_SERVER_URL"];
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const urls: string[] = [];
    try {
      const response = await GET({
        url: new URL("http://localhost/api/bell"),
        request: new Request("http://localhost/api/bell"),
        locals: { orgId: "org-1", userId: "user-1" },
        fetch: async (url: string | URL | Request) => {
          urls.push(String(url));
          return Response.json({ count: 4 });
        },
      } as never);

      await expect(response.json()).resolves.toEqual({ count: 4 });
      expect(urls).toEqual([
        "http://127.0.0.1:3210/api/v1/notifications/unread-count?orgId=org-1&userId=user-1",
      ]);
    } finally {
      if (original === undefined) delete process.env["FULCRUM_SERVER_URL"];
      else process.env["FULCRUM_SERVER_URL"] = original;
    }
  });

  test("returns transport errors without opening persistence from the web route", async () => {
    const response = await GET({
      url: new URL("http://localhost/api/bell"),
      request: new Request("http://localhost/api/bell"),
      locals: { orgId: "org-1", userId: "user-1" },
      fetch: async () => Response.json(
        { error: { message: "Not authenticated." } },
        { status: 401 },
      ),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated." });
  });

  test("requires notification scope before calling the public API", async () => {
    const response = await GET({
      url: new URL("http://localhost/api/bell"),
      request: new Request("http://localhost/api/bell"),
      locals: {},
      fetch: async () => {
        throw new Error("unexpected fetch");
      },
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Notification scope is required." });
  });
});
