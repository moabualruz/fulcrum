import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
const intake = [{ id: "intake-1", title: "Import request", status: "open", traceId: "trace-intake-1" }];

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/intake", { method: "POST", body: fd });
}

mock.module("../project-request-scope", () => ({
  requestProjectScope: async (_locals: unknown, projectId: string) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@work-management/interface/pm-structure.ts", () => ({
  listIntakeRequests: async (_em: unknown, ctx: { projectId: string }) => {
    calls.push(`list:${ctx.projectId}`);
    return intake;
  },
  createIntakeRequest: async (_em: unknown, ctx: { projectId: string }, input: { title: string; source: string }) => {
    calls.push(`create:${ctx.projectId}:${input.title}:${input.source}`);
    return { id: "intake-new" };
  },
  updateIntakeRequest: async (_em: unknown, ctx: { projectId: string }, input: { intakeId: string; title?: string; status?: string }) => {
    calls.push(`update:${ctx.projectId}:${input.intakeId}:${input.title ?? ""}:${input.status ?? ""}`);
    return { ok: true };
  },
  deleteIntakeRequest: async (_em: unknown, ctx: { projectId: string }, intakeId: string) => {
    calls.push(`delete:${ctx.projectId}:${intakeId}`);
    return { ok: true };
  },
  listProjectModules: async () => [],
  createProjectModule: async () => ({ id: "module-new" }),
  updateProjectModule: async () => ({ ok: true }),
  deleteProjectModule: async () => ({ ok: true }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/projects/[id]/intake +page.server.ts", () => {
  test("server route uses work-management PM structure interface", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/pm-structure");
    expect(source).toContain("../project-request-scope");
    expect(source).not.toContain("@work-management/application/");
    expect(source).not.toContain("from \"typeorm\"");
    expect(source).not.toContain("@mikro-orm");
  });

  test("load streams project intake requests", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id: "project-1" }, locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await result.streamed.data;

    expect(result.projectId).toBe("project-1");
    expect(payload.intake).toEqual(intake);
    expect(calls).toEqual(["list:project-1"]);
  });

  test("create update and delete actions delegate to PM structure interface", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const eventBase = { params: { id: "project-1" }, locals: {} };

    await mod.actions.create({ ...eventBase, request: form({ title: "New request", source: "manual" }) } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({ ...eventBase, request: form({ intakeId: "intake-1", title: "Triaged", status: "accepted" }) } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({ ...eventBase, request: form({ intakeId: "intake-1" }) } as Parameters<typeof mod.actions.delete>[0]);

    expect(calls).toEqual([
      "create:project-1:New request:manual",
      "update:project-1:intake-1:Triaged:accepted",
      "delete:project-1:intake-1",
    ]);
  });
});
