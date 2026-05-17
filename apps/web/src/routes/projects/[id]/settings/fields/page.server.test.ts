import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface PublicCustomFieldRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  type: string;
  configJson: Record<string, unknown>;
  required: boolean;
  archived: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

function eventFor(
  projectId: string,
  fetchImpl: typeof fetch = fetchCustomFields(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(`http://localhost/projects/${projectId}/settings/fields`);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function fetchCustomFields(calls: string[] = [], seed: PublicCustomFieldRow[] = []): typeof fetch {
  const fields = seed.map((field) => ({ ...field }));

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname}${url.search} ${headers.get("cookie") ?? ""} ${String(init?.body ?? "")}`);

    if (url.pathname.startsWith("/api/v1/projects/") && method === "GET") {
      return Response.json({ id: decodeURIComponent(url.pathname.split("/").at(-1) ?? ""), name: "Alpha" });
    }

    if (url.pathname === "/api/v1/custom-fields" && method === "GET") {
      const projectId = url.searchParams.get("projectId");
      return Response.json(fields.filter((field) => field.projectId === projectId && !field.archived));
    }

    if (url.pathname === "/api/v1/custom-fields" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row: PublicCustomFieldRow = {
        id: `field-${fields.length + 1}`,
        orgId: body.orgId,
        projectId: body.projectId,
        name: body.name,
        type: body.type === "checkbox" ? "boolean" : body.type,
        configJson: body.configJson ?? {},
        required: body.required ?? false,
        archived: false,
        position: fields.length,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      };
      fields.push(row);
      return Response.json(row, { status: 201 });
    }

    if (url.pathname.startsWith("/api/v1/custom-fields/") && method === "PATCH") {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const body = JSON.parse(String(init?.body ?? "{}"));
      const field = fields.find((candidate) => candidate.id === id);
      if (!field) return Response.json({ message: "not found" }, { status: 404 });
      if (typeof body.name === "string") field.name = body.name;
      if (typeof body.position === "number") field.position = body.position;
      return Response.json(field);
    }

    if (url.pathname.startsWith("/api/v1/custom-fields/") && method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const field = fields.find((candidate) => candidate.id === id);
      if (!field) return Response.json({ message: "not found" }, { status: 404 });
      field.archived = true;
      return Response.json({ ok: true });
    }

    return Response.json({ message: `unexpected ${method} ${url.pathname}${url.search}` }, { status: 500 });
  }) as typeof fetch;
}

function seedField(overrides: Partial<PublicCustomFieldRow> = {}): PublicCustomFieldRow {
  return {
    id: "field-1",
    orgId: "org-1",
    projectId: "project-1",
    name: "Priority",
    type: "text",
    configJson: {},
    required: false,
    archived: false,
    position: 0,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("/projects/[id]/settings/fields +page.server.ts", () => {
  test("server route uses the custom field public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createCustomFieldApiForEvent");
    expect(source).toContain("ensureProjectExists");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("@work-management/application/custom-fields");
    expect(source).not.toContain("@work-management/application/projects");
  });

  test("load returns empty fields list for new project", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("project-1", fetchCustomFields(calls)));

    expect(result.fields).toEqual([]);
    expect(result.projectId).toBe("project-1");
    expect(calls).toEqual([
      "GET /api/v1/projects/project-1?orgId=org-1 sid=test-session ",
      "GET /api/v1/custom-fields?orgId=org-1&userId=user-1&projectId=project-1 sid=test-session ",
    ]);
  });

  test("create action adds a field, load returns it in the existing page shape", async () => {
    const fetchImpl = fetchCustomFields();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "Priority");
    fd.set("fieldType", "text");
    const result = await mod.actions.create({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { success?: boolean }).success).toBe(true);

    const loadResult = await mod.load(eventFor("project-1", fetchImpl));
    expect(loadResult.fields).toHaveLength(1);
    expect(loadResult.fields[0].name).toBe("Priority");
    expect(loadResult.fields[0].field_type).toBe("text");
  });

  test("archive action hides field from list", async () => {
    const fetchImpl = fetchCustomFields([], [seedField({ id: "field-archive", name: "Size", type: "select" })]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const archiveFd = new FormData();
    archiveFd.set("id", "field-archive");

    await mod.actions.archive({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: archiveFd }),
    } as Parameters<typeof mod.actions.archive>[0]);

    const afterArchive = await mod.load(eventFor("project-1", fetchImpl));
    expect(afterArchive.fields).toHaveLength(0);
  });

  test("update action maps sortOrder to public API position", async () => {
    const fetchImpl = fetchCustomFields([], [seedField({ id: "field-update" })]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const updateFd = new FormData();
    updateFd.set("id", "field-update");
    updateFd.set("name", "Urgency");
    updateFd.set("sortOrder", "7");

    const result = await mod.actions.update({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: updateFd }),
    } as Parameters<typeof mod.actions.update>[0]);
    expect((result as { success?: boolean }).success).toBe(true);

    const afterUpdate = await mod.load(eventFor("project-1", fetchImpl));
    expect(afterUpdate.fields[0]).toMatchObject({ name: "Urgency", sort_order: 7 });
  });

  test("load maps public boolean type back to the existing checkbox field type", async () => {
    const fetchImpl = fetchCustomFields([], [seedField({ type: "boolean" })]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(eventFor("project-1", fetchImpl));

    expect(result.fields[0].field_type).toBe("checkbox");
  });

  test("create with empty name returns fail 400", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const fd = new FormData();
    fd.set("name", "");
    fd.set("fieldType", "text");
    const result = await mod.actions.create({
      ...eventFor("project-1"),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { status?: number }).status).toBe(400);
  });
});
