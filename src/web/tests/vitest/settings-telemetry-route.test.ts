const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { render } = await import("@testing-library/svelte");
  const { describe, expect, test, vi } = await import("vitest");
  const { actions, load } = await import("../../src/routes/settings/telemetry/+page.server");

  const trpcResponse = (data: unknown) =>
    new Response(JSON.stringify({ result: { data: { json: data } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  function event(fetchFn: typeof fetch) {
    return {
      locals: { session: { id: "session-1", userId: "user-1" } },
      fetch: fetchFn,
      request: { headers: new Headers({ cookie: "sid=abc" }) },
      url: new URL("http://localhost/settings/telemetry"),
    };
  }

  describe("/settings/telemetry route", () => {
    test("loads telemetry status from tRPC and renders controls", async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(trpcResponse({ opted_in: false, row_count: 7 }));
      const data = await load(event(fetchFn as unknown as typeof fetch));

      expect(data.status).toEqual({ opted_in: false, row_count: 7 });
      expect(fetchFn).toHaveBeenCalledWith(
        "http://localhost/api/trpc/telemetry.status?input=%7B%7D",
        expect.objectContaining({ method: "GET" }),
      );

      const { default: TelemetryPage } = await import("../../src/routes/settings/telemetry/+page.svelte");
      const { getByRole, getByText, container } = render(TelemetryPage, {
        props: { data: { activeProjectId: null, ...data } },
      });

      expect(getByRole("heading", { name: "Telemetry" })).toBeTruthy();
      expect(getByText("Disabled")).toBeTruthy();
      expect(getByText("7 events stored locally")).toBeTruthy();
      expect(container.querySelector("[data-telemetry-settings]")).toBeTruthy();
      expect(getByRole("button", { name: "Enable" })).toBeTruthy();
      expect(getByRole("button", { name: "Purge" })).toBeTruthy();
    });

    test("actions call opt-in, opt-out, and purge mutations", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(trpcResponse({ ok: true }))
        .mockResolvedValueOnce(trpcResponse({ ok: true }))
        .mockResolvedValueOnce(trpcResponse({ ok: true, deleted: 3 }));

      await actions.optIn(event(fetchFn as unknown as typeof fetch));
      await actions.optOut(event(fetchFn as unknown as typeof fetch));
      await expect(actions.purge(event(fetchFn as unknown as typeof fetch))).resolves.toEqual({
        ok: true,
        deleted: 3,
      });

      expect(fetchFn).toHaveBeenNthCalledWith(
        1,
        "http://localhost/api/trpc/telemetry.optIn",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ json: {} }) }),
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        "http://localhost/api/trpc/telemetry.optOut",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ json: {} }) }),
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        3,
        "http://localhost/api/trpc/telemetry.purge",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ json: {} }) }),
      );
    });
  });
}

export {};
