import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface DocPayload {
  id: string;
  projectId?: string | null;
  project_id?: string | null;
  type?: string;
  docType?: string;
  title: string;
  bodyMd?: string;
  body_md?: string;
  frontmatter?: Record<string, unknown>;
}

function makeEvent(fetchImpl: typeof fetch, request?: Request, params = { id: "doc-1" }) {
  return {
    params,
    locals: { activeProjectId: "project-1", orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: request ?? new Request("http://localhost/docs/doc-1/edit", {
      headers: { cookie: "sid=test-session" },
    }),
    url: new URL("http://localhost/docs/doc-1/edit"),
  };
}

const DOC: DocPayload = {
  id: "doc-1",
  projectId: "project-1",
  type: "spec",
  title: "EditMe",
  bodyMd: "the body\n",
  frontmatter: { title: "EditMe", kind: "spec", labels: ["x", "y"] },
};

describe("/docs/[id]/edit +page.server.ts", () => {
  test("server route uses the document public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("loadWebEditDoc");
    expect(source).not.toContain("saveWebEditDoc");
    expect(source).not.toMatch(/getKysely|selectFrom|insertInto|updateTable|deleteFrom|\.execute\(/);
  });

  test("load returns the doc and a populated SuperValidated form from the public API", async () => {
    const calls: Array<{ url: string; method: string; cookie: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("cookie"),
      });
      return Response.json(DOC);
    }) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    const result = await mod.load(makeEvent(fetchImpl) as Parameters<typeof mod.load>[0]);

    expect(result.doc).toMatchObject({
      id: "doc-1",
      project_id: "project-1",
      kind: "spec",
      title: "EditMe",
      body: "the body\n",
      frontmatter: { title: "EditMe", kind: "spec", labels: ["x", "y"] },
    });
    expect(result.form?.data?.title).toBe("EditMe");
    expect(result.form?.data?.kind).toBe("spec");
    expect(result.form?.data?.body).toBe("the body\n");
    expect(result.form?.data?.labels).toBe("x, y");
    expect(calls).toEqual([
      { url: "http://localhost/api/v1/docs/doc-1", method: "GET", cookie: "sid=test-session" },
    ]);
  });

  test("default action saves changes through the public API and returns { form }", async () => {
    const calls: Array<{ url: string; method: string; cookie: string | null; body: unknown }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("cookie"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ ...DOC, title: "After", type: "decision", bodyMd: "new body\n" });
    }) as typeof fetch;
    const fd = new FormData();
    fd.set("title", "After");
    fd.set("kind", "decision");
    fd.set("labels", "a, b");
    fd.set("body", "new body\n");
    const request = new Request("http://localhost/docs/doc-1/edit", {
      method: "POST",
      body: fd,
      headers: { cookie: "sid=test-session" },
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);

    const result = await mod.actions.default(makeEvent(fetchImpl, request) as Parameters<
      typeof mod.actions.default
    >[0]);

    expect((result as { form?: unknown }).form).toBeDefined();
    expect(calls).toEqual([{
      url: "http://localhost/api/v1/docs/doc-1",
      method: "PATCH",
      cookie: "sid=test-session",
      body: {
        title: "After",
        type: "decision",
        bodyMd: "new body\n",
        frontmatter: {
          title: "After",
          kind: "decision",
          labels: ["a", "b"],
        },
      },
    }]);
  });

  test("byte-identical body when unchanged: load -> resubmit unchanged -> body bytes sent unchanged", async () => {
    const originalBody = "Line one with    spaces\nline\ttwo\n   trailing  \n";
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if ((init?.method ?? "GET") === "GET") return Response.json({ ...DOC, bodyMd: originalBody });
      return Response.json({ ...DOC, bodyMd: originalBody });
    }) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const loaded = await mod.load(makeEvent(fetchImpl) as Parameters<typeof mod.load>[0]);
    const fd = new FormData();
    fd.set("title", String(loaded.form.data.title));
    fd.set("kind", String(loaded.form.data.kind));
    fd.set("labels", String(loaded.form.data.labels));
    fd.set("body", String(loaded.form.data.body));
    const request = new Request("http://localhost/docs/doc-1/edit", {
      method: "POST",
      body: fd,
    });

    await mod.actions.default(makeEvent(fetchImpl, request) as Parameters<typeof mod.actions.default>[0]);

    expect(calls.at(-1)).toMatchObject({
      url: "http://localhost/api/v1/docs/doc-1",
      method: "PATCH",
      body: expect.objectContaining({ bodyMd: originalBody }),
    });
  });
});
