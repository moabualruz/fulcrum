const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { render } = await import("@testing-library/svelte");
  const { describe, expect, test, vi } = await import("vitest");
  const { actions, load } = await import("../../src/routes/settings/errors/+page.server");

  const session = { id: "session-1", userId: "user-1" };

  const trpcResponse = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify({ result: { data: { json: data } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });

  const errors = [
    {
      id: "err-1",
      occurredAt: "2026-05-03T10:00:00.000Z",
      errorMessage: "Unhandled rejection",
      recentCliCommand: "fulcrum web",
      recentTrpcProcedure: "tasks.list",
      os: "darwin",
      arch: "arm64",
      bunVersion: "1.3.0",
      fulcrumVersion: "0.1.0",
      stackTrace: "Error: fail\n at run (<cwd>/src/index.ts:1:1)",
      context: { source: "unhandledRejection" },
    },
  ];

  function event(fetchFn: typeof fetch) {
    return {
      locals: { session },
      fetch: fetchFn,
      request: { headers: new Headers({ cookie: "sid=abc" }) },
      url: new URL("http://localhost/settings/errors"),
    };
  }

  describe("/settings/errors route", () => {
    test("load fetches errorLogs.list with default limit", async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(trpcResponse(errors));

      const data = await load(event(fetchFn as unknown as typeof fetch));

      expect(data.errorLogs).toEqual(errors);
      expect(fetchFn).toHaveBeenCalledWith(
        "http://localhost/api/trpc/errorLogs.list?input=%7B%22limit%22%3A20%7D",
        expect.objectContaining({ method: "GET" }),
      );
    });

    test("renders crashlog rows with stack details", async () => {
      const { default: ErrorsPage } = await import("../../src/routes/settings/errors/+page.svelte");
      const { getByRole, getByText, container } = render(ErrorsPage, {
        props: {
          data: { activeProjectId: null, errorLogs: errors },
        },
      });

      expect(getByRole("heading", { name: "Errors" })).toBeTruthy();
      expect(getByText("Unhandled rejection")).toBeTruthy();
      expect(getByText("tasks.list")).toBeTruthy();
      expect(container.querySelector("[data-error-stack]")?.textContent).toContain("<cwd>/src/index.ts");
    });

    test("clear action calls errorLogs.clear", async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(trpcResponse({ ok: true, deleted: 1 }));
      const formData = new FormData();
      formData.set("before", "2026-05-03T00:00:00.000Z");

      const result = await actions.clear({
        ...event(fetchFn as unknown as typeof fetch),
        request: {
          headers: new Headers({ cookie: "sid=abc" }),
          formData: async () => formData,
        },
      });

      expect(result).toEqual({ ok: true, deleted: 1 });
      expect(fetchFn).toHaveBeenCalledWith(
        "http://localhost/api/trpc/errorLogs.clear",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ json: { before: "2026-05-03T00:00:00.000Z" } }),
        }),
      );
    });
  });
}

export {};
