import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createWorkflowApiCaller,
  WorkflowApiError,
} from "@workflow-coordination/interface/http/workflow-api-client";

interface E2eEvent {
  params: { id: string };
  fetch: typeof fetch;
  locals: App.Locals;
  request: Request;
  url: URL;
}

function workflowApiBaseUrl(url: URL): string {
  return (
    process.env["FULCRUM_SERVER_URL"] ??
    process.env["FULCRUM_PUBLIC_API_URL"] ??
    `${url.protocol}//${url.host}`
  ).replace(/\/+$/, "");
}

function createE2eWorkflowApi(event: E2eEvent) {
  return createWorkflowApiCaller({
    baseUrl: workflowApiBaseUrl(event.url),
    fetch: event.fetch,
    headers: {
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
}

export const load: PageServerLoad = async ({ params }) => ({
  projectId: params.id,
});

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
      const api = createE2eWorkflowApi(event as unknown as E2eEvent);
      const result = await api.reports.runGeneratedE2eRegressionTests({
        projectId,
        runner,
        traceId,
        testFiles: testFiles.length > 0 ? testFiles : undefined,
      });
      return { ok: true, mode: "runE2e", result };
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
