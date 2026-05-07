import { beforeEach, describe, expect, test } from "bun:test";

import { ACTIVE_PROJECT_COOKIE } from "$lib/state/active-project";

import { DELETE, POST } from "./+server.ts";

type SetCall = {
  name: string;
  value: string;
  opts: Record<string, unknown>;
};
type DeleteCall = { name: string; opts: Record<string, unknown> };

function createCookiesStub(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(ACTIVE_PROJECT_COOKIE, initial);
  const setCalls: SetCall[] = [];
  const deleteCalls: DeleteCall[] = [];
  return {
    get(name: string): string | undefined {
      return store.get(name);
    },
    set(name: string, value: string, opts: Record<string, unknown>): void {
      store.set(name, value);
      setCalls.push({ name, value, opts });
    },
    delete(name: string, opts: Record<string, unknown>): void {
      store.delete(name);
      deleteCalls.push({ name, opts });
    },
    _setCalls: setCalls,
    _deleteCalls: deleteCalls,
    _store: store,
  };
}

function makeEvent(body: string | null, method: "POST" | "DELETE" = "POST") {
  const cookies = createCookiesStub();
  const init: RequestInit = { method };
  if (body !== null) {
    init.body = body;
    init.headers = { "content-type": "application/json" };
  }
  const request = new Request(
    "http://localhost/api/active-project",
    init,
  );
  return { cookies, request };
}

describe("POST /api/active-project", () => {
  let event: ReturnType<typeof makeEvent>;

  test("valid slug → 204 + cookies.set recorded", async () => {
    event = makeEvent(JSON.stringify({ slug: "fulcrum" }));
    const res = await POST(event as never);
    expect(res.status).toBe(204);
    expect(event.cookies._setCalls).toHaveLength(1);
    const call = event.cookies._setCalls[0]!;
    expect(call.name).toBe(ACTIVE_PROJECT_COOKIE);
    expect(call.value).toBe("fulcrum");
    expect(event.cookies._deleteCalls).toHaveLength(0);
  });

  test("slug=null → 204 + cookies.delete recorded", async () => {
    event = makeEvent(JSON.stringify({ slug: null }));
    const res = await POST(event as never);
    expect(res.status).toBe(204);
    expect(event.cookies._deleteCalls).toHaveLength(1);
    expect(event.cookies._deleteCalls[0]).toEqual({
      name: ACTIVE_PROJECT_COOKIE,
      opts: { path: "/" },
    });
    expect(event.cookies._setCalls).toHaveLength(0);
  });

  test("invalid slug → 400 JSON error, cookies untouched", async () => {
    event = makeEvent(JSON.stringify({ slug: "BAD SLUG" }));
    const res = await POST(event as never);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid project slug/);
    expect(event.cookies._setCalls).toHaveLength(0);
    expect(event.cookies._deleteCalls).toHaveLength(0);
  });

  test("malformed JSON → 400, cookies untouched", async () => {
    event = makeEvent("not json{");
    const res = await POST(event as never);
    expect(res.status).toBe(400);
    expect(event.cookies._setCalls).toHaveLength(0);
    expect(event.cookies._deleteCalls).toHaveLength(0);
  });
});

describe("DELETE /api/active-project", () => {
  test("→ 204 + cookies.delete recorded", async () => {
    const event = makeEvent(null, "DELETE");
    const res = await DELETE(event as never);
    expect(res.status).toBe(204);
    expect(event.cookies._deleteCalls).toHaveLength(1);
    expect(event.cookies._deleteCalls[0]).toEqual({
      name: ACTIVE_PROJECT_COOKIE,
      opts: { path: "/" },
    });
    expect(event.cookies._setCalls).toHaveLength(0);
  });
});
