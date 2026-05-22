import { describe, expect, test } from "bun:test";

import { createAgentRunApiCaller } from "./agent-run-api-client.ts";

describe("agent run public API client", () => {
  test("covers web run page data and mutation endpoints", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ ok: true, id: "run-2" });
    }) as typeof fetch;

    const api = createAgentRunApiCaller({
      baseUrl: "http://127.0.0.1:3000",
      orgId: "org-1",
      userId: "user-1",
      fetch: fetchFn,
    });

    await api.runs.pageData({ projectId: null, range: "all", agent: "codex" });
    await api.runs.projectRuns({ projectId: "project-1" });
    await api.runs.pageDetail({ id: "run-1", projectId: "project-1" });
    await api.runs.dispatchPrompt({ projectId: null, agentName: "codex", prompt: "task-1" });
    await api.runs.recordApprovalDecision({
      id: "run-1",
      approvalId: "approval-1",
      decision: "approve",
      note: "ship",
    });
    await api.runs.archiveArtifact({ id: "run-1", artifactId: "artifact-1" });
    await api.runs.linkArtifactToDoc({ id: "run-1", artifactId: "artifact-1", docId: "doc-1" });
    await api.runs.promoteArtifactToMemory({ id: "run-1", artifactId: "artifact-1" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3000/api/v1/runs/page-data?orgId=org-1&userId=user-1&range=all&agent=codex",
      "http://127.0.0.1:3000/api/v1/runs/project?orgId=org-1&userId=user-1&projectId=project-1",
      "http://127.0.0.1:3000/api/v1/runs/run-1/page-data?orgId=org-1&userId=user-1&projectId=project-1",
      "http://127.0.0.1:3000/api/v1/runs/prompt-dispatch?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/runs/run-1/approval-decision?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/runs/run-1/artifacts/artifact-1/archive?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/runs/run-1/artifacts/artifact-1/link-doc?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3000/api/v1/runs/run-1/artifacts/artifact-1/promote-memory?orgId=org-1&userId=user-1",
    ]);
    expect(JSON.parse(String(calls[4]?.init.body))).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      note: "ship",
    });
  });
});
