import { describe, expect, test } from "bun:test";

function loadEvent(fetch: typeof globalThis.fetch, overrides: Partial<App.Locals> = {}) {
  return {
    params: { id: "project-import" },
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      em: null,
      container: null,
      ...overrides,
    },
    fetch,
    request: new Request("http://localhost/projects/project-import/settings/import", {
      headers: { cookie: "sid=session-1" },
    }),
    url: new URL("http://localhost/projects/project-import/settings/import"),
  };
}

describe("project import settings route", () => {
  test("loads project existence through the public project API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "project-import" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?project-import-load=${Date.now()}`);

    await expect(mod.load(loadEvent(fetch) as never)).resolves.toMatchObject({
      projectId: "project-import",
      importers: expect.any(Array),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/projects/project-import?orgId=org-1");
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
    const mod = await import(`./+page.server.ts?project-import-missing=${Date.now()}`);

    let thrown: unknown;
    try {
      await mod.load(loadEvent(fetch) as never);
    } catch (cause) {
      thrown = cause;
    }
    expect((thrown as { status?: number })?.status).toBe(404);
  });

  test("route and page source do not use direct app queries or fake import success", async () => {
    const [serverSource, pageSource] = await Promise.all([
      Bun.file(new URL("./+page.server.ts", import.meta.url)).text(),
      Bun.file(new URL("./+page.svelte", import.meta.url)).text(),
    ]);

    expect(serverSource).not.toContain("getProjectOrNull");
    expect(serverSource).not.toContain("requestAppScope");
    expect(pageSource).not.toContain("trpc.import");
    expect(pageSource).not.toContain("Simulated");
    expect(pageSource).not.toContain("importable: csvPreviewRows.length > 0 ? 42 : 0");
  });
});
