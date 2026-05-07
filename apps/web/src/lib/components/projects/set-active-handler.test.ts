import { describe, expect, test } from "bun:test";

import { runSetActive } from "./set-active-handler.ts";

function makeFetchStub(response: { status: number; body?: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchStub: typeof fetch = ((
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    calls.push({ url: String(input), init });
    const body =
      response.body === undefined ? "" : JSON.stringify(response.body);
    return Promise.resolve(
      new Response(body === "" ? null : body, {
        status: response.status,
        headers:
          response.body === undefined
            ? undefined
            : { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { fetchStub, calls };
}

describe("runSetActive helper", () => {
  test("POSTs slug to /api/active-project and returns ok=true on 204", async () => {
    const { fetchStub, calls } = makeFetchStub({ status: 204 });
    const result = await runSetActive("fulcrum", { fetch: fetchStub });
    expect(result).toEqual({ ok: true, status: 204 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/active-project");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ slug: "fulcrum" }));
  });

  test("invokes onSuccess on 204", async () => {
    const { fetchStub } = makeFetchStub({ status: 204 });
    let called = 0;
    await runSetActive("alpha", {
      fetch: fetchStub,
      onSuccess: () => {
        called += 1;
      },
    });
    expect(called).toBe(1);
  });

  test("400 returns ok=false with error message", async () => {
    const { fetchStub } = makeFetchStub({
      status: 400,
      body: { error: "bad" },
    });
    const result = await runSetActive("BAD", { fetch: fetchStub });
    expect(result).toEqual({ ok: false, status: 400, error: "bad" });
  });
});
