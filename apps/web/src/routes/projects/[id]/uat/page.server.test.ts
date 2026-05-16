import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";

const calls: string[] = [];
let loadShouldThrowNotFound = false;
let handoffStatus = "ready";

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/uat", { method: "POST", body: fd });
}

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId: string | null) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@planning-review/interface/project-review-reports.ts", () => ({
  buildUatCodeReviewHandoff: async (_em: unknown, _ctx: unknown, input: { projectId: string; traceId?: string }) => {
    calls.push(`handoff:${input.projectId}`);
    if (loadShouldThrowNotFound) throw new AppNotFoundError("Project not found");
    return {
      projectId: input.projectId,
      status: handoffStatus,
      finalQaStatus: "passed",
      nextAction: "prompt_user_for_uat_code_review",
      decisionOptions: [
        { id: "approve_without_manual_review", label: "Approve", description: "Approve." },
        { id: "request_changes", label: "Request Changes", description: "Send feedback." },
      ],
      promptMarkdown: "# UAT Prompt",
    };
  },
  recordUatCodeReviewDecision: async (_em: unknown, _ctx: unknown, input: { projectId: string; decision: string; reviewType: string; feedbackText?: string }) => {
    calls.push(`decision:${input.projectId}:${input.decision}:${input.reviewType}`);
    const statusMap: Record<string, string> = {
      approve_without_manual_review: "approved",
      request_changes: "changes_requested",
      start_uat: "review_started",
      start_code_review: "review_started",
    };
    return {
      projectId: input.projectId,
      decision: input.decision,
      reviewType: input.reviewType,
      status: statusMap[input.decision] ?? "review_started",
      nextAction: input.decision === "approve_without_manual_review" ? "real_data_e2e_generated" : "feedback_run_scheduled",
    };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  loadShouldThrowNotFound = false;
  handoffStatus = "ready";
});

describe("/projects/[id]/uat +page.server.ts", () => {
  test("server route uses service interfaces instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@planning-review/interface/project-review-reports");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@planning-review/application/");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns handoff data for a project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.handoff).toBeTruthy();
    expect(result.handoff.status).toBe("ready");
    expect(calls).toContain("handoff:project-1");
  });

  test("load returns null handoff on error", async () => {
    loadShouldThrowNotFound = true;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    try {
      const result = await mod.load({
        params: { id: "missing-project" },
        locals: {},
      } as Parameters<typeof mod.load>[0]);
      expect(result.handoff).toBeNull();
    } catch (err) {
      expect((err as { status: number }).status).toBe(404);
    }
  });

  test("decide action records approval and returns redirect to reports", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      request: form({ decision: "approve_without_manual_review" }),
      locals: {},
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "decide",
      redirectTo: "/projects/project-1/reports",
    });
    expect(result.decision.status).toBe("approved");
    expect(calls).toContain("decision:project-1:approve_without_manual_review:uat");
  });

  test("decide action records request_changes and returns redirect to review", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      request: form({ decision: "request_changes", feedbackText: "Fix the tests" }),
      locals: {},
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "decide",
      redirectTo: "/projects/project-1/review",
    });
    expect(result.decision.status).toBe("changes_requested");
    expect(calls).toContain("decision:project-1:request_changes:uat");
  });

  test("decide action returns error on invalid decision", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      request: form({ decision: "invalid_decision" }),
      locals: {},
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result.data?.ok).toBe(false);
    expect(result.data?.message).toContain("Unsupported UAT decision");
  });

  test("decide action defaults to approve_without_manual_review when empty", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      request: form({}),
      locals: {},
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result).toMatchObject({ ok: true, mode: "decide" });
    expect(result.decision.decision).toBe("approve_without_manual_review");
  });
});
