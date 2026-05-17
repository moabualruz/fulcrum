import { describe, expect, mock, test } from "bun:test";

import { actions, load } from "./+page.server";

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function makeEvent(url: string, apiFetch: typeof fetch, request = new Request(url)) {
  return {
    url: new URL(url),
    request,
    fetch: apiFetch,
    locals: { orgId: "org-1", userId: "owner-1" },
  };
}

function formRequest(body: Record<string, string>): Request {
  const data = new FormData();
  for (const [key, value] of Object.entries(body)) data.set(key, value);
  return new Request("http://localhost/settings/errors", {
    method: "POST",
    body: data,
    headers: { cookie: "session=abc" },
  });
}

describe("/settings/errors +page.server.ts", () => {
  test("loads paged error logs through the public API and preserves page shape", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const apiFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), init });
      return Response.json({
        data: [
          {
            id: "err-1",
            errorMessage: "boom",
            stackTrace: "stack",
            context: { route: "settings" },
            os: "darwin",
            fulcrumVersion: "1.0.0",
            occurredAt: "2026-05-14T12:00:00.000Z",
          },
        ],
        total: 31,
        limit: 20,
        offset: 20,
      });
    }) as unknown as typeof fetch;

    const result = await load(makeEvent("http://localhost/settings/errors?page=2", apiFetch) as never);
    expect(result.page).toBe(2);
    const payload = await streamedData<{
      errors: Array<{ id: string; message: string; stack_trace: string | null; version: string | null }>;
      total: number;
      page: number;
      pageSize: number;
    }>(result);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe("/api/v1/error-logs");
    expect(calls[0]?.url.searchParams.get("orgId")).toBe("org-1");
    expect(calls[0]?.url.searchParams.get("userId")).toBe("owner-1");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("20");
    expect(calls[0]?.url.searchParams.get("offset")).toBe("20");
    expect(calls[0]?.url.searchParams.get("includeTotal")).toBe("true");
    expect(payload).toEqual({
      errors: [
        {
          id: "err-1",
          message: "boom",
          stack_trace: "stack",
          context: { route: "settings" },
          os: "darwin",
          version: "1.0.0",
          occurred_at: "2026-05-14T12:00:00.000Z",
        },
      ],
      total: 31,
      page: 2,
      pageSize: 20,
    });
  });

  test("clearBefore requires a before date", async () => {
    const apiFetch = mock(async () => Response.json({ ok: true, deleted: 0 })) as unknown as typeof fetch;

    const result = await actions.clearBefore(
      makeEvent("http://localhost/settings/errors", apiFetch, formRequest({})) as never,
    );

    expect(result).toMatchObject({ status: 400 });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("clearBefore deletes rows before date through the public API", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const apiFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), init });
      return Response.json({ ok: true, deleted: 2 });
    }) as unknown as typeof fetch;

    const result = await actions.clearBefore(
      makeEvent(
        "http://localhost/settings/errors",
        apiFetch,
        formRequest({ before: "2026-05-01T00:00" }),
      ) as never,
    );

    expect(result).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(calls[0]?.url.pathname).toBe("/api/v1/error-logs");
    expect(calls[0]?.url.searchParams.get("orgId")).toBe("org-1");
    expect(calls[0]?.url.searchParams.get("userId")).toBe("owner-1");
    expect(calls[0]?.url.searchParams.get("before")).toBe("2026-05-01T00:00");
    expect(calls[0]?.init?.headers).toEqual({
      "content-type": "application/json",
      cookie: "session=abc",
    });
  });
});
