import { describe, expect, test } from "bun:test";

import { FULCRUM_REQUEST_ID_HEADER } from "@fulcrum/server/public-api/request-id.ts";
import { GET, POST } from "./+server.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Post-retirement contract: `/api/trpc/[...path]` is a pure invocation-layer
 * proxy. It owns no in-process tRPC runtime, no EntityManager, no container —
 * `event.locals` carries only `orgId`/`userId`. The handler forwards the
 * request to the server-owned HTTP endpoint via `event.fetch` and returns the
 * upstream response (body, status, headers) verbatim. The request-id header is
 * therefore whatever the backend set, not locally minted.
 */
function createFetchStub(upstream: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchStub = (async (input: URL | string | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return upstream;
  }) as unknown as typeof fetch;
  return { fetchStub, calls };
}

function createEvent(
  method: "GET" | "POST",
  fetchStub: typeof fetch,
  body?: BodyInit,
) {
  const url = new URL("http://localhost/api/trpc/health.ping");
  return {
    url,
    request: new Request(url, {
      method,
      headers: { cookie: "fulcrum-session=abc" },
      ...(body !== undefined ? { body } : {}),
    }),
    fetch: fetchStub,
    locals: { session: null, orgId: null, userId: null },
  };
}

describe("api/trpc route handler", () => {
  test("forwards the upstream request-id header verbatim from the backend", async () => {
    const upstream = new Response('{"result":{"data":"pong"}}', {
      status: 200,
      headers: { [FULCRUM_REQUEST_ID_HEADER]: crypto.randomUUID() },
    });
    const { fetchStub } = createFetchStub(upstream);

    const response = await GET(createEvent("GET", fetchStub) as never);

    // Header originates from the backend response, not minted by the proxy.
    expect(response.headers.get(FULCRUM_REQUEST_ID_HEADER)).toMatch(UUID_RE);
  });

  test("GET delegates to the server-owned tRPC endpoint via event.fetch", async () => {
    const { fetchStub, calls } = createFetchStub(new Response("ok", { status: 200 }));

    await GET(createEvent("GET", fetchStub) as never);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/api/trpc/health.ping");
    expect(calls[0]?.init.method).toBe("GET");
    // Session cookies are forwarded so the backend can authenticate the caller.
    expect((calls[0]?.init.headers as Record<string, string>)["cookie"]).toBe(
      "fulcrum-session=abc",
    );
  });

  test("returns the upstream status and body unchanged for mutations", async () => {
    const upstream = new Response('{"error":{"code":-32600}}', {
      status: 400,
      statusText: "Bad Request",
    });
    const { fetchStub } = createFetchStub(upstream);

    const response = await POST(
      createEvent("POST", fetchStub, '{"id":1}') as never,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":{"code":-32600}}');
  });
});
