import { describe, expect, mock, test } from "bun:test";

import { selectProject } from "./project-picker-helpers.ts";

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

describe("selectProject helper", () => {
  test("POSTs slug to /api/active-project and returns ok=true on 204", async () => {
    const { fetchStub, calls } = makeFetchStub({ status: 204 });
    const onSuccess = mock(() => {});
    const result = await selectProject("fulcrum", {
      fetch: fetchStub,
      onSuccess,
    });
    expect(result).toEqual({ ok: true, status: 204 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/active-project");
    expect(calls[0]!.init?.method).toBe("POST");
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ slug: "fulcrum" }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("slug=null sends {slug:null} body", async () => {
    const { fetchStub, calls } = makeFetchStub({ status: 204 });
    const result = await selectProject(null, { fetch: fetchStub });
    expect(result.ok).toBe(true);
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ slug: null }));
  });

  test("400 returns ok=false with error message and skips onSuccess", async () => {
    const { fetchStub } = makeFetchStub({
      status: 400,
      body: { error: "bad" },
    });
    const onSuccess = mock(() => {});
    const result = await selectProject("BAD", {
      fetch: fetchStub,
      onSuccess,
    });
    expect(result).toEqual({ ok: false, status: 400, error: "bad" });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("non-204 2xx (e.g. 200) is treated as unexpected and skips onSuccess", async () => {
    const { fetchStub } = makeFetchStub({ status: 200 });
    const onSuccess = mock(() => {});
    const result = await selectProject("fulcrum", {
      fetch: fetchStub,
      onSuccess,
    });
    expect(result).toEqual({ ok: false, status: 200, error: "unexpected" });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("falls back to globalThis.fetch when opts.fetch is omitted", async () => {
    const original = globalThis.fetch;
    const calls: { url: string; init?: RequestInit }[] = [];
    const recording: typeof fetch = ((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      calls.push({ url: String(input), init });
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    globalThis.fetch = recording;
    try {
      const result = await selectProject("fulcrum");
      expect(result).toEqual({ ok: true, status: 204 });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("/api/active-project");
      expect(calls[0]!.init?.method).toBe("POST");
      expect(calls[0]!.init?.body).toBe(JSON.stringify({ slug: "fulcrum" }));
    } finally {
      globalThis.fetch = original;
    }
  });
});
