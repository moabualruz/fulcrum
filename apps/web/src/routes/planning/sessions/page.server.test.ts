import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/planning/sessions", {
    method: "POST",
    headers: { cookie: "sid=abc" },
    body: fd,
  });
}

function event(request: Request, locals: Record<string, unknown> = {}) {
  return {
    request,
    url: new URL("http://localhost/planning/sessions"),
    fetch,
    locals: {
      activeProjectId: "project-active",
      workspaceId: "workspace-1",
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      ...locals,
    },
  };
}

mock.module("@workflow-coordination/interface/http/workflow-api-client", () => ({
  WorkflowApiError: class WorkflowApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  createWorkflowApiCaller: (options: { baseUrl: string; headers: { cookie: string } }) => {
    calls.push(`api:${options.baseUrl}:${options.headers.cookie}`);
    return {
      planning: {
        startGuidedAcpPlanningSession: async (input: Record<string, unknown>) => {
          calls.push(`guided:${input["projectId"]}:${input["acpSessionId"]}:${input["agentName"]}:${input["permissionMode"]}`);
          return {
            status: "started",
            session: {
              acpSessionId: input["acpSessionId"],
              projectId: input["projectId"],
              traceId: input["traceId"],
              agentName: input["agentName"],
              modeId: input["modeId"],
              modelId: input["modelId"],
              permissionMode: input["permissionMode"],
            },
            prompt: "AI Assist prompt",
            permissionOptions: [{ optionId: "allow_once", name: "Allow once" }],
          };
        },
        startFreeformWorkFromDocs: async (input: Record<string, unknown>) => {
          calls.push(`freeform:${input["projectId"]}:${input["title"]}:${input["acpSessionId"] ?? ""}`);
          return {
            status: "started",
            document: { id: "doc-1", title: input["title"] },
            prompt: "Freeform AI Assist prompt",
          };
        },
      },
    };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/planning/sessions +page.server.ts", () => {
  test("server route uses workflow API boundary without direct service application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@workflow-coordination/interface/http/workflow-api-client");
    expect(source).toContain("$lib/server/workflow-api");
    expect(source).not.toContain("@workflow-coordination/application/");
    expect(source).not.toContain("from \"typeorm\"");
    expect(source).not.toContain("@mikro-orm");
  });

  test("load returns active project and generated session defaults", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ locals: { activeProjectId: "project-1" } } as Parameters<typeof mod.load>[0]);

    expect(result.defaultProjectId).toBe("project-1");
    expect(result.defaultTraceId).toMatch(/^trace-[0-9a-f-]{36}$/);
    expect(result.defaultAcpSessionId).toMatch(/^acp-[0-9a-f-]{36}$/);
  });

  test("guidedAcpStart sends selected docs, permission mode, model, mode, trace, and project metadata", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.guidedAcpStart(event(form({
      acpSessionId: "acp-1",
      acpAgentName: "codex",
      acpCwd: "/repo",
      acpUserPrompt: "Plan with AI Assist",
      acpPermissionMode: "review_each_tool",
      selectedDocIds: "doc-1, doc-2",
      projectId: "project-1",
      traceId: "trace-1",
      modeId: "planning",
      modelId: "gpt-5.5",
      maxDocChars: "12000",
    })) as Parameters<typeof mod.actions.guidedAcpStart>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "guidedAcpStart",
      guidedAcpStart: {
        status: "started",
        session: {
          acpSessionId: "acp-1",
          projectId: "project-1",
          agentName: "codex",
          permissionMode: "review_each_tool",
        },
      },
    });
    expect(calls).toEqual(["api:http://localhost:sid=abc", "guided:project-1:acp-1:codex:review_each_tool"]);
  });

  test("guidedAcpStart rejects invalid permission mode before dispatch", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.guidedAcpStart(event(form({
      acpAgentName: "codex",
      acpCwd: "/repo",
      acpUserPrompt: "Plan with AI Assist",
      acpPermissionMode: "root",
    })) as Parameters<typeof mod.actions.guidedAcpStart>[0]);

    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      ok: false,
      mode: "guidedAcpStart",
      error: "permissionMode must be review_each_tool, allow_workspace, or read_only",
    });
    expect(calls).toEqual([]);
  });

  test("freeformStart persists freeform docs before AI Assist planning context", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.freeformStart(event(form({
      freeformTitle: "Workflow brief",
      freeformBodyMd: "Need a prototype-first plan.",
      freeformUserPrompt: "Plan from this document",
      projectId: "project-1",
      acpSessionId: "acp-freeform",
      traceId: "trace-freeform",
    })) as Parameters<typeof mod.actions.freeformStart>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "freeformStart",
      freeformStart: {
        status: "started",
        document: { id: "doc-1", title: "Workflow brief" },
        prompt: "Freeform AI Assist prompt",
      },
    });
    expect(calls).toEqual(["api:http://localhost:sid=abc", "freeform:project-1:Workflow brief:acp-freeform"]);
  });
});
