import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(e: unknown): e is RedirectError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    "location" in e &&
    typeof (e as RedirectError).status === "number"
  );
}

function makeEvent(fetchImpl: typeof fetch, request?: Request) {
  return {
    params: {},
    locals: { activeProjectId: "project-1", orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: request ?? new Request("http://localhost/docs/new", {
      headers: { cookie: "sid=test-session" },
    }),
    url: new URL("http://localhost/docs/new"),
  };
}

describe("/docs/new +page.server.ts", () => {
  test("server route uses the document public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("createDocumentAction");
  });

  test("load returns an empty SuperValidated form and template map", async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(makeEvent(fetchImpl) as Parameters<typeof mod.load>[0]);
    expect(result.form).toBeDefined();
    expect(result.form?.data?.title).toBe("");
    expect(result.form?.data?.kind).toBe("");
    expect(result.form?.data?.body).toBe("");
    expect(result.form?.data?.labels).toBe("");

    const docTypes = ["spec", "adr", "wiki", "runbook", "meeting", "postmortem", "rfc", "note", "scratch"];
    for (const docType of docTypes) {
      expect(result.templates).toHaveProperty(docType);
      expect(typeof result.templates[docType]).toBe("string");
    }
    expect(result.templates["adr"]).toContain("## Context");
    expect(result.templates["adr"]).toContain("## Decision");
    expect(result.templates["adr"]).toContain("## Consequences");
  });

  test("default action creates a document through the public API and redirects to the document", async () => {
    const calls: Array<{ url: string; method: string; cookie: string | null; body: unknown }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("cookie"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ id: "doc-created", title: "My Doc", type: "spec" }, { status: 201 });
    }) as typeof fetch;

    const fd = new FormData();
    fd.set("title", "My Doc");
    fd.set("kind", "spec");
    fd.set("labels", "alpha, beta");
    fd.set("body", "# Hello\nbody\n");
    const request = new Request("http://localhost/docs/new", {
      method: "POST",
      body: fd,
      headers: { cookie: "sid=test-session" },
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);

    let caught: unknown;
    try {
      await mod.actions.default(makeEvent(fetchImpl, request) as Parameters<
        typeof mod.actions.default
      >[0]);
    } catch (error) {
      caught = error;
    }

    expect(calls).toEqual([{
      url: "http://localhost/api/v1/docs",
      method: "POST",
      cookie: "sid=test-session",
      body: {
        projectId: "project-1",
        title: "My Doc",
        type: "spec",
        bodyMd: "# Hello\nbody\n",
        frontmatter: {
          title: "My Doc",
          kind: "spec",
          labels: ["alpha", "beta"],
        },
      },
    }]);
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toBe("/docs/doc-created");
    }
  });

  test("default action with empty title returns fail(400, { form })", async () => {
    const fetchImpl = (async () => Response.json({ message: "should not be called" }, { status: 500 })) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("title", "");
    fd.set("kind", "note");
    fd.set("body", "");
    const request = new Request("http://localhost/docs/new", {
      method: "POST",
      body: fd,
    });
    const result = (await mod.actions.default(makeEvent(fetchImpl, request) as Parameters<
      typeof mod.actions.default
    >[0])) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };
    expect(result.status).toBe(400);
    expect(result.data?.form).toBeDefined();
    expect(result.data?.form?.valid).toBe(false);
  });
});
