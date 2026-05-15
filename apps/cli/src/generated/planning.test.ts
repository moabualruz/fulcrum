import { afterEach, describe, expect, test } from "bun:test";

import { createPlanningCommand } from "./planning.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalWorkspaceId = process.env["FULCRUM_WORKSPACE_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_WORKSPACE_ID", originalWorkspaceId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated planning workflow commands", () => {
  test("route planning workflow commands through the Nest workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_WORKSPACE_ID"] = "workspace-1";
    const calls: Array<{ url: string; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), body });
      if (String(url).includes("/freeform/prompt")) return Response.json({ prompt: "prompt", context: { sourceRefs: [] } });
      if (String(url).includes("/technical-cycle/generate")) return Response.json({ status: "ready_for_plan_review", eventId: "event-1" });
      if (String(url).includes("/materialize")) return Response.json({ materialization: { tasks: [] } });
      if (String(url).includes("/freeform/start")) return Response.json({ status: "ready_for_planning", traceId: "trace-1" });
      if (String(url).includes("/guided-acp/start")) return Response.json({ status: "ready_for_acp_prompt", traceId: "trace-1" });
      if (String(url).includes("/guided-acp/session-action")) return Response.json({ status: "session_action_recorded", action: { method: "session/request_permission" }, traceId: "trace-1" });
      if (String(url).includes("/continuous-update/restart")) return Response.json({ status: "ready_for_replanning", traceId: "trace-1" });
      if (String(url).includes("/artifact-execution/run")) {
        return Response.json({ status: "passed", runner: "sandbox-agent", runId: "run-1", traceId: "trace-1" });
      }
      return Response.json({ title: "Plan", taskDrafts: [] });
    }) as typeof fetch;

    await runGeneratedPlanningCommand([
      "build-freeform-docs-planning-prompt",
      "--project-id",
      "project-1",
      "--user-prompt",
      "Plan prompt",
      "--selected-doc-ids",
      "doc-1",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "generate-technical-planning-cycle",
      "--project-id",
      "project-1",
      "--source",
      "freeform_docs",
      "--user-prompt",
      "Generate plan",
      "--selected-doc-ids",
      "doc-1",
      "--prototype-paths",
      "apps/web/src/routes/planning/workbench-prototype.tsx",
      "--boilerplate-paths",
      "services/planning-review/src/application/technical-planning-cycle.ts",
      "--success-criteria",
      "Review plan,Trace tasks",
      "--task-seeds-json",
      "[{\"clientKey\":\"T1\",\"title\":\"Assemble context\"}]",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "preview-approved-plan-breakdown",
      "--project-id",
      "project-1",
      "--plan-id",
      "plan-1",
      "--approved-plan-markdown",
      "# Plan",
      "--source-doc-ids",
      "doc-1,doc-2",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "materialize-approved-plan-breakdown",
      "--project-id",
      "project-1",
      "--plan-id",
      "plan-1",
      "--approved-plan-markdown",
      "# Plan",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "start-freeform-work-from-docs",
      "--project-id",
      "project-1",
      "--title",
      "Freeform brief",
      "--body-md",
      "Raw context",
      "--user-prompt",
      "Plan this",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "start-guided-acp-planning-session",
      "--project-id",
      "project-1",
      "--acp-session-id",
      "acp-1",
      "--agent-name",
      "codex",
      "--cwd",
      "/workspace",
      "--user-prompt",
      "Plan guided",
      "--selected-doc-ids",
      "doc-1",
      "--permission-mode",
      "review_each_tool",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "record-guided-acp-session-action",
      "--project-id",
      "project-1",
      "--acp-session-id",
      "acp-1",
      "--action",
      "resolve_permission",
      "--trace-id",
      "trace-1",
      "--option-id",
      "allow_once",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "restart-planning-cycle-from-updates",
      "--project-id",
      "project-1",
      "--trigger",
      "manual_doc_edit",
      "--user-prompt",
      "Replan",
      "--selected-doc-ids",
      "doc-1",
      "--target-task-ids",
      "task-1",
      "--changed-docs-json",
      "[{\"id\":\"doc-1\",\"bodyMd\":\"Updated\"}]",
      "--json",
    ]);
    await runGeneratedPlanningCommand([
      "run-artifact-execution",
      "--plan-id",
      "plan-1",
      "--artifact-path",
      "apps/web/src/routes/planning/workbench-prototype.tsx",
      "--trace-id",
      "trace-1",
      "--command",
      "bun",
      "--args-json",
      "[\"test\",\"apps/web/src/routes/planning/page.svelte.test.ts\"]",
      "--checks-json",
      "[\"Prototype renders\"]",
      "--copy-to-worktree-json",
      "[\"apps/web/src/routes/planning/workbench-prototype.tsx\"]",
      "--timeout-ms",
      "120000",
      "--json",
    ]);

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/planning/freeform/prompt",
      "http://127.0.0.1:3210/workflows/planning/technical-cycle/generate",
      "http://127.0.0.1:3210/workflows/planning/approved-plan/preview",
      "http://127.0.0.1:3210/workflows/planning/approved-plan/materialize",
      "http://127.0.0.1:3210/workflows/planning/freeform/start",
      "http://127.0.0.1:3210/workflows/planning/guided-acp/start",
      "http://127.0.0.1:3210/workflows/planning/guided-acp/session-action",
      "http://127.0.0.1:3210/workflows/planning/continuous-update/restart",
      "http://127.0.0.1:3210/workflows/planning/artifact-execution/run",
    ]);
    expect(calls[0]?.body).toMatchObject({
      projectId: "project-1",
      userPrompt: "Plan prompt",
      selectedDocIds: ["doc-1"],
      traceId: "trace-1",
    });
    expect(calls[1]?.body).toMatchObject({
      projectId: "project-1",
      source: "freeform_docs",
      userPrompt: "Generate plan",
      selectedDocIds: ["doc-1"],
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
      successCriteria: ["Review plan", "Trace tasks"],
      taskSeeds: [{ clientKey: "T1", title: "Assemble context" }],
    });
    expect(calls[2]?.body).toMatchObject({
      projectId: "project-1",
      planId: "plan-1",
      approvedPlanMarkdown: "# Plan",
      traceId: "trace-1",
      sourceDocRefs: [{ id: "doc-1" }, { id: "doc-2" }],
    });
    expect(calls[3]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      planId: "plan-1",
      approvedPlanMarkdown: "# Plan",
    });
    expect(calls[4]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "Freeform brief",
      bodyMd: "Raw context",
      userPrompt: "Plan this",
      traceId: "trace-1",
    });
    expect(calls[5]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      acpSessionId: "acp-1",
      agentName: "codex",
      cwd: "/workspace",
      selectedDocIds: ["doc-1"],
      permissionMode: "review_each_tool",
    });
    expect(calls[6]?.body).toMatchObject({
      projectId: "project-1",
      acpSessionId: "acp-1",
      action: "resolve_permission",
      traceId: "trace-1",
      optionId: "allow_once",
    });
    expect(calls[7]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      trigger: "manual_doc_edit",
      userPrompt: "Replan",
      selectedDocIds: ["doc-1"],
      targetTaskIds: ["task-1"],
      changedDocs: [{ id: "doc-1", bodyMd: "Updated" }],
    });
    expect(calls[8]?.body).toMatchObject({
      planId: "plan-1",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace-1",
      command: "bun",
      args: ["test", "apps/web/src/routes/planning/page.svelte.test.ts"],
      checks: ["Prototype renders"],
      copyToWorktree: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      timeoutMs: 120000,
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { prompt: "prompt", context: { sourceRefs: [] } },
      { status: "ready_for_plan_review", eventId: "event-1" },
      { title: "Plan", taskDrafts: [] },
      { materialization: { tasks: [] } },
      { status: "ready_for_planning", traceId: "trace-1" },
      { status: "ready_for_acp_prompt", traceId: "trace-1" },
      { status: "session_action_recorded", action: { method: "session/request_permission" }, traceId: "trace-1" },
      { status: "ready_for_replanning", traceId: "trace-1" },
      { status: "passed", runner: "sandbox-agent", runId: "run-1", traceId: "trace-1" },
    ]);
  });
});

async function runGeneratedPlanningCommand(args: string[]): Promise<void> {
  const command = createPlanningCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
