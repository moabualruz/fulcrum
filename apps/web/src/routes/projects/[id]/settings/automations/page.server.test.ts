import { describe, expect, test } from "bun:test";

function loadEvent(fetch: typeof globalThis.fetch, overrides: Partial<App.Locals> = {}) {
  return {
    params: { id: "project-automation" },
    locals: {
      activeProjectId: null,
      session: { userId: "session-user" },
      orgId: "org-1",
      userId: "user-1",
      em: null,
      container: null,
      ...overrides,
    },
    fetch,
    request: new Request("http://localhost/projects/project-automation/settings/automations", {
      headers: { cookie: "sid=session-1" },
    }),
    url: new URL("http://localhost/projects/project-automation/settings/automations"),
  };
}

describe("project automation settings route", () => {
  test("loads project context through the public project API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "project-automation" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?project-automations-load=${Date.now()}`);

    await expect(mod.load(loadEvent(fetch) as never)).resolves.toEqual({
      projectId: "project-automation",
      orgId: "org-1",
      currentUserId: "user-1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/projects/project-automation?orgId=org-1");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
  });

  test("maps missing project API response to a route 404", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ message: "Project not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?project-automations-missing=${Date.now()}`);

    let thrown: unknown;
    try {
      await mod.load(loadEvent(fetch) as never);
    } catch (cause) {
      thrown = cause;
    }
    expect((thrown as { status?: number })?.status).toBe(404);
  });

  test("route source does not use direct application scope or project queries", async () => {
    const serverSource = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(serverSource).not.toContain("getProjectOrNull");
    expect(serverSource).not.toContain("requestAppScope");
  });
});
