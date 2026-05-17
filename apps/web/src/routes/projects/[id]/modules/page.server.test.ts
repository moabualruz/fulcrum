import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
const modules = [{ id: "module-1", name: "Launch", status: "active", traceId: "trace-module-1" }];

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/modules", { method: "POST", body: fd });
}

mock.module("../project-request-scope", () => ({
  requestProjectScope: async (_locals: unknown, projectId: string) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@work-management/interface/pm-structure.ts", () => ({
  listProjectModules: async (_em: unknown, ctx: { projectId: string }) => {
    calls.push(`list:${ctx.projectId}`);
    return modules;
  },
  createProjectModule: async (_em: unknown, ctx: { projectId: string }, input: { name: string; status: string }) => {
    calls.push(`create:${ctx.projectId}:${input.name}:${input.status}`);
    return { id: "module-new" };
  },
  updateProjectModule: async (_em: unknown, ctx: { projectId: string }, input: { moduleId: string; name?: string; status?: string }) => {
    calls.push(`update:${ctx.projectId}:${input.moduleId}:${input.name ?? ""}:${input.status ?? ""}`);
    return { ok: true };
  },
  deleteProjectModule: async (_em: unknown, ctx: { projectId: string }, moduleId: string) => {
    calls.push(`delete:${ctx.projectId}:${moduleId}`);
    return { ok: true };
  },
  listIntakeRequests: async () => [],
  createIntakeRequest: async () => ({ id: "intake-new" }),
  updateIntakeRequest: async () => ({ ok: true }),
  deleteIntakeRequest: async () => ({ ok: true }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/projects/[id]/modules +page.server.ts", () => {
  test("server route uses work-management PM structure interface", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/pm-structure");
    expect(source).toContain("../project-request-scope");
    expect(source).not.toContain("@work-management/application/");
    expect(source).not.toContain("from \"typeorm\"");
    expect(source).not.toContain("@mikro-orm");
  });

  test("load streams project modules", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id: "project-1" }, locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await result.streamed.data;

    expect(result.projectId).toBe("project-1");
    expect(payload.modules).toEqual(modules);
    expect(calls).toEqual(["list:project-1"]);
  });

  test("create update and delete actions delegate to PM structure interface", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const eventBase = { params: { id: "project-1" }, locals: {} };

    await mod.actions.create({ ...eventBase, request: form({ name: "Platform", status: "active" }) } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({ ...eventBase, request: form({ moduleId: "module-1", name: "Core", status: "completed" }) } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({ ...eventBase, request: form({ moduleId: "module-1" }) } as Parameters<typeof mod.actions.delete>[0]);

    expect(calls).toEqual([
      "create:project-1:Platform:active",
      "update:project-1:module-1:Core:completed",
      "delete:project-1:module-1",
    ]);
  });
});
