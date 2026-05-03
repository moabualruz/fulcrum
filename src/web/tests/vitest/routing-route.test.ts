const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { render } = await import("@testing-library/svelte");
  const { describe, expect, test, vi } = await import("vitest");
  const settingsRoute = await import("../../src/routes/settings/routing/+page.server");
  const projectRoute = await import("../../src/routes/projects/[id]/routing/+page.server");

  const ownerSession = { id: "session-1", userId: "user-1" };
  const globalRule = {
    id: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000010",
    projectId: null,
    name: "Bugs to Codex",
    conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
    actionAgent: "codex",
    actionSkillSet: ["router"],
    priority: 10,
    enabled: true,
    source: "manual",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
  };
  const projectRule = {
    ...globalRule,
    id: "00000000-0000-4000-8000-000000000002",
    projectId: "00000000-0000-4000-8000-000000000099",
    name: "Docs to Claude",
    actionAgent: "claude",
    priority: 20,
  };

  const trpcResponse = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify({ result: { data: { json: data } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });

  const event = (fetchFn: typeof fetch, pathname = "/settings/routing", params = {}) => ({
    locals: { session: ownerSession },
    fetch: fetchFn,
    request: { headers: new Headers({ cookie: "sid=abc" }) },
    url: new URL(`http://localhost${pathname}`),
    params,
  });

  describe("routing settings routes", () => {
    test("renders global rules with CRUD controls, reorder controls, and dry-run panel", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { getByRole, getByText, container } = render(Page, {
        props: {
          data: {
            activeProjectId: null,
            projectId: null,
            rules: [globalRule],
            inheritedRules: [],
            dryRunResult: null,
          },
        },
      });

      expect(getByRole("heading", { name: "Routing Rules" })).toBeTruthy();
      expect(getByText("Bugs to Codex")).toBeTruthy();
      expect(getByText("codex")).toBeTruthy();
      expect(getByText("global")).toBeTruthy();
      expect(container.querySelector('[data-routing-enabled-toggle="00000000-0000-4000-8000-000000000001"]')).toBeTruthy();
      expect(container.querySelector('[data-routing-delete="00000000-0000-4000-8000-000000000001"]')).toBeTruthy();
      expect(container.querySelector("[data-routing-reorder-down]")).toBeTruthy();
      expect(getByRole("textbox", { name: "Task JSON" })).toBeTruthy();
    });

    test("create validates conditions_json inline before routing.create", async () => {
      const fetchFn = vi.fn().mockResolvedValue(trpcResponse([]));
      const formData = new FormData();
      formData.set("name", "Broken");
      formData.set("actionAgent", "codex");
      formData.set("conditionsJson", "{not json");

      const result = await settingsRoute.actions.create({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => formData },
      });

      expect(result).toMatchObject({ status: 400, data: { createError: expect.stringContaining("conditions_json") } });
      expect(fetchFn).not.toHaveBeenCalledWith(
        "http://localhost/api/trpc/routing.create",
        expect.anything(),
      );
    });

    test("create, update, reorder, dryRun, and delete call routing tRPC procedures", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(trpcResponse(globalRule))
        .mockResolvedValueOnce(trpcResponse({ ...globalRule, enabled: false }))
        .mockResolvedValueOnce(trpcResponse(globalRule))
        .mockResolvedValueOnce(trpcResponse(globalRule))
        .mockResolvedValueOnce(trpcResponse({ ruleId: globalRule.id, source: "rule", agent: "codex", confidence: 1 }))
        .mockResolvedValueOnce(trpcResponse({ ok: true }));

      const createForm = new FormData();
      createForm.set("name", "Bugs to Codex");
      createForm.set("actionAgent", "codex");
      createForm.set("conditionsJson", JSON.stringify(globalRule.conditionsJson));
      await settingsRoute.actions.create({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => createForm },
      });

      const toggleForm = new FormData();
      toggleForm.set("id", globalRule.id);
      toggleForm.set("enabled", "false");
      await settingsRoute.actions.toggle({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => toggleForm },
      });

      const reorderForm = new FormData();
      reorderForm.set("orderedIds", `${globalRule.id},${projectRule.id}`);
      await settingsRoute.actions.reorder({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => reorderForm },
      });

      const dryRunForm = new FormData();
      dryRunForm.set("taskJson", JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] }));
      await settingsRoute.actions.dryRun({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => dryRunForm },
      });

      const deleteForm = new FormData();
      deleteForm.set("id", globalRule.id);
      await settingsRoute.actions.delete({
        ...event(fetchFn as unknown as typeof fetch),
        request: { headers: new Headers({ cookie: "sid=abc" }), formData: async () => deleteForm },
      });

      expect(fetchFn).toHaveBeenNthCalledWith(
        1,
        "http://localhost/api/trpc/routing.create",
        expect.objectContaining({ body: expect.stringContaining('"actionAgent":"codex"') }),
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        "http://localhost/api/trpc/routing.update",
        expect.objectContaining({ body: expect.stringContaining('"enabled":false') }),
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        3,
        "http://localhost/api/trpc/routing.update",
        expect.objectContaining({ body: expect.stringContaining('"priority":10') }),
      );
      expect(String(fetchFn.mock.calls[4][0])).toContain("/api/trpc/routing.dryRun?input=");
      expect(fetchFn).toHaveBeenNthCalledWith(
        6,
        "http://localhost/api/trpc/routing.delete",
        expect.objectContaining({ body: JSON.stringify({ json: { id: globalRule.id } }) }),
      );
    });

    test("project routing loads project rules plus read-only inherited globals and passes projectId", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(trpcResponse([projectRule]))
        .mockResolvedValueOnce(trpcResponse([globalRule, projectRule]));

      const data = await projectRoute.load(
        event(fetchFn as unknown as typeof fetch, `/projects/${projectRule.projectId}/routing`, { id: projectRule.projectId }),
      );

      expect(data.rules).toEqual([projectRule]);
      expect(data.inheritedRules).toEqual([globalRule]);
      expect(String(fetchFn.mock.calls[0][0])).toContain(
        `routing.list?input=${encodeURIComponent(JSON.stringify({ projectId: projectRule.projectId }))}`,
      );

      const { default: Page } = await import("../../src/routes/projects/[id]/routing/+page.svelte");
      const { container, getByText } = render(Page, {
        props: { data: { ...data, activeProjectId: projectRule.projectId, dryRunResult: null } },
      });

      expect(getByText("Inherited global rules")).toBeTruthy();
      expect(container.querySelector(`[data-routing-delete="${globalRule.id}"]`)).toBeNull();
      expect(container.querySelector(`[data-routing-inherited="${globalRule.id}"]`)).toBeTruthy();
    });
  });
}

export {};
