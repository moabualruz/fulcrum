const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { render } = await import("@testing-library/svelte");
  const { describe, expect, test, vi } = await import("vitest");
  const { actions, load } = await import("../../src/routes/settings/flags/+page.server");

  const ownerSession = { id: "session-1", userId: "user-1" };

  const apiResponse = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });

  const flags = [
    {
      name: "router-llm",
      enabled: false,
      description: "Enable the LLM-based task router for agent dispatch decisions.",
    },
    {
      name: "embeddings",
      enabled: true,
      description: "Enable vector embeddings generation for documents and memories.",
    },
  ];

  function loadEvent(fetchFn: typeof fetch) {
    return {
      locals: { session: ownerSession },
      fetch: fetchFn,
      request: { headers: new Headers({ cookie: "sid=abc" }) },
      url: new URL("http://localhost/settings/flags"),
    };
  }

  describe("/settings/flags route", () => {
    test("renders registered flags with current switch state", async () => {
      const { default: FlagsPage } = await import("../../src/routes/settings/flags/+page.svelte");
      const { getByRole, getByText, container } = render(FlagsPage, {
        props: {
          data: { activeProjectId: null, flags },
        },
      });

      expect(getByRole("heading", { name: "Feature Flags" })).toBeTruthy();
      expect(getByText("router-llm")).toBeTruthy();
      expect(getByText(flags[0].description)).toBeTruthy();
      expect(getByRole("switch", { name: "Enable router-llm" }).getAttribute("aria-checked")).toBe("false");
      expect(getByRole("switch", { name: "Disable embeddings" }).getAttribute("aria-checked")).toBe("true");
      expect(container.querySelector('input[name="enabled"]')?.getAttribute("value")).toBe("true");
    });

    test("toggle action calls flags.set, then load re-reads flags.list", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(apiResponse([]))
        .mockResolvedValueOnce(apiResponse({ ok: true }))
        .mockResolvedValueOnce(apiResponse([]))
        .mockResolvedValueOnce(apiResponse([{ ...flags[0], enabled: true }]));

      const formData = new FormData();
      formData.set("flag", "router-llm");
      formData.set("enabled", "true");

      const actionResult = await actions.toggle({
        ...loadEvent(fetchFn as unknown as typeof fetch),
        request: {
          headers: new Headers({ cookie: "sid=abc" }),
          formData: async () => formData,
        },
      });

      expect(actionResult).toEqual({ ok: true, flag: "router-llm" });
      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        "http://localhost/api/v1/feature-flags",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            flag: "router-llm",
            enabled: true,
            orgId: "00000000-0000-0000-0000-000000000001",
          }),
        }),
      );

      const data = await load(loadEvent(fetchFn as unknown as typeof fetch));

      expect(data.flags).toEqual([{ ...flags[0], enabled: true }]);
      expect(fetchFn).toHaveBeenNthCalledWith(
        4,
        "http://localhost/api/v1/feature-flags?orgId=00000000-0000-0000-0000-000000000001&userId=local",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });
}

export {};
