import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type GeneratedE2eRegressionRunner = "bun" | "playwright";

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  try {
    const history = await workflowApi(event).reports.listGeneratedE2eRuns({
      ...workflowApiProjectMetadata(event, projectId),
      projectId,
      limit: 20,
    });
    return { projectId, history };
  } catch {
    return { projectId, history: [] };
  }
};

function field(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(fd: FormData, key: string): string | undefined {
  const value = field(fd, key);
  return value.length > 0 ? value : undefined;
}

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export const actions: Actions = {
  runE2e: async (event) => {
    const fd = await event.request.formData();
    const projectId = event.params.id;
    const runner = field(fd, "runner") || "bun";
    const traceId = optionalField(fd, "traceId") || `trace-e2e-${projectId}`;
    const testFiles = parseCsv(field(fd, "testFiles"));

    if (runner !== "bun" && runner !== "playwright") {
      return fail(400, { ok: false, error: "runner must be bun or playwright" });
    }

    try {
      const result = await workflowApi(event).reports.runGeneratedE2eRegressionTests({
        ...workflowApiProjectMetadata(event, projectId),
        projectId,
        runner: runner as GeneratedE2eRegressionRunner,
        traceId,
        testFiles: testFiles.length > 0 ? testFiles : undefined,
      });
      return { ok: true, mode: "runE2e" as const, result };
    } catch (err) {
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "E2E run failed";
      const status =
        err instanceof WorkflowApiError &&
        err.status >= 400 &&
        err.status <= 599
          ? err.status
          : 400;
      return fail(status, { ok: false, error: message });
    }
  },
};

function workflowApi(event: Parameters<PageServerLoad>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
