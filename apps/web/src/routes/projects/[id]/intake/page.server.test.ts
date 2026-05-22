import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PlanningStructureApiError } from "@work-management/interface/http/planning-structure-api-client";

const calls: string[] = [];
const intake = [{ id: "intake-1", title: "Import request", status: "open", traceId: "trace-intake-1" }];
let listError: unknown;

mock.module("$lib/server/planning-structure-api", () => ({
  PlanningStructureApiError,
  createPlanningStructureApiForEvent: () => ({
    intake: {
      list: async (input: { projectId: string }) => {
        calls.push(`list:${input.projectId}`);
        if (listError) throw listError;
        return intake;
      },
      create: async (input: { projectId: string; title: string; source?: string }) => {
        calls.push(`create:${input.projectId}:${input.title}:${input.source ?? ""}`);
        return { id: "intake-new" };
      },
      update: async (input: { id: string; projectId: string; title?: string; status?: string }) => {
        calls.push(`update:${input.projectId}:${input.id}:${input.title ?? ""}:${input.status ?? ""}`);
        return { ok: true };
      },
      delete: async (input: { id: string; projectId: string }) => {
        calls.push(`delete:${input.projectId}:${input.id}`);
        return { ok: true };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  listError = undefined;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/intake", { method: "POST", body: fd });
}

describe("/projects/[id]/intake +page.server.ts", () => {
  test("server route uses the planning structure public API web client", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("$lib/server/planning-structure-api");
    expect(source).not.toContain("project-request-scope");
    expect(source).not.toContain("requestProjectScope");
    expect(source).not.toContain("@work-management/interface/pm-structure");
    expect(source).not.toContain("@work-management/application/");
    expect(source).not.toContain("from \"typeorm\"");
  });

  test("load streams project intake requests", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id: "project-1" }, locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await result.streamed.data;

    expect(result.projectId).toBe("project-1");
    expect(payload.intake).toEqual(intake);
    expect(calls).toEqual(["list:project-1"]);
  });

  test("load throws 404 when the project is missing", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 10}`);
    listError = new PlanningStructureApiError("Project not found", 404);
    await expect(mod.load({
      params: { id: "missing" },
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
  });

  test("create update and delete actions delegate to the planning structure API", async () => {
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
