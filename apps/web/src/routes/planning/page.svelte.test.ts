import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/planning"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

const BREAKDOWN = {
  title: "Approved Plan",
  docs: [{ clientKey: "plan", input: { title: "Approved Plan", bodyMd: "# Approved Plan" } }],
  taskDrafts: [{
    clientKey: "T1",
    input: { title: "Build planning route", description: "Trace: trace_1" },
    blockedByClientKeys: ["T0"],
    successCriteria: [{ id: "SC1", text: "Web preserves trace ids." }],
    traceId: "trace_1",
  }],
  warnings: ["No prototype artifacts were declared."],
};

type PlanningContextFixture = {
  sourceRefs: Array<{ kind: "doc"; id: string }>;
  selectedDocs?: Array<{
    id: string;
    title: string;
    breadcrumb?: string;
    versionId?: string;
    updatedAt?: string;
    truncated?: boolean;
  }>;
  contextMarkdown: string;
};

type PageProps = {
  data: { defaultPlanId: string; defaultTraceId: string };
  form?: {
    ok: boolean;
    mode: "preview" | "materialize" | "freeformPrompt" | "freeformStart" | "guidedAcpStart" | "guidedAcpSessionAction" | "continuousUpdate" | "generate" | "workflowCycle";
    preview?: typeof BREAKDOWN;
    freeformStart?: {
      status: "ready_for_planning";
      document: { id: string; title: string };
      context: PlanningContextFixture;
      prompt: string;
    };
    freeformPrompt?: {
      context: PlanningContextFixture;
      prompt: string;
    };
    guidedAcpStart?: {
      status: "ready_for_acp_prompt";
      session: {
        acpSessionId: string;
        projectId?: string;
        traceId?: string;
        agentName: string;
        modeId: string;
        modelId?: string;
        permissionMode: string;
      };
      permissionOptions: Array<{ optionId: string; name: string }>;
      traffic: { entries: Array<{ method: string }> };
      context: PlanningContextFixture;
      prompt: string;
    };
    guidedAcpSessionAction?: {
      status: "session_action_recorded";
      session: {
        acpSessionId: string;
        projectId?: string | null;
        traceId: string;
        agentName: string;
        modeId: string;
        modelId?: string;
        sessionStatus: string;
      };
      action: { type: string; method: string; optionId?: string; modeId?: string; modelId?: string };
      traffic: { entries: Array<{ method: string }> };
    };
    continuousUpdate?: {
      status: "ready_for_replanning";
      traceId?: string;
      acpSessionId?: string;
      targetTaskIds: string[];
      targetTasks?: Array<{ id: string; title: string; status?: string | null }>;
      missingTargetTaskIds?: string[];
      changedDocs: Array<{ id: string; title: string }>;
      context: PlanningContextFixture;
      prompt: string;
    };
    technicalPlanning?: {
      status: "ready_for_plan_review";
      eventId?: string;
      reviewPrompt: string;
      plan: {
        planId: string;
        reviewId?: string;
        title: string;
        traceId?: string;
        source: "freeform_docs" | "guided_acp" | "continuous_update";
        markdown: string;
        prototypePaths: string[];
        boilerplatePaths: string[];
      };
      artifactPreviews?: Array<{
        id: string;
        kind: string;
        path: string;
        label: string;
        mode: string;
        urlPath?: string;
        run?: { command: string; args: string[] };
        reviewChecks: string[];
      }>;
      breakdown: typeof BREAKDOWN;
    };
    workflowCycle?: {
      traceId: string;
      finalQa?: { status?: string };
      generatedE2e?: {
        status?: string;
        testFiles?: string[];
      };
    };
  };
};

describe("/planning +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders approved-plan form with preview and materialize actions", () => {
    const { body } = render(Page, {
      props: { data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" } },
    });

    expect(body).toMatch(/<h1\b[^>]*>\s*Planning\s*<\/h1>/);
    expect(body).toContain('name="planId"');
    expect(body).toContain('value="plan_web"');
    expect(body).toContain('name="traceId"');
    expect(body).toContain('value="trace_web"');
    expect(body).toContain('name="approvedPlanMarkdown"');
    expect(body).toContain('formaction="?/preview"');
    expect(body).toContain('formaction="?/materialize"');
    expect(body).toContain('name="freeformTitle"');
    expect(body).toContain('name="freeformBodyMd"');
    expect(body).toContain('formaction="?/freeformStart"');
    expect(body).toContain('name="freeformUserPrompt"');
    expect(body).toContain('name="selectedDocIds"');
    expect(body).toContain('formaction="?/freeformPrompt"');
    expect(body).toContain('name="acpAgentName"');
    expect(body).toContain('name="acpCwd"');
    expect(body).toContain('name="acpPermissionMode"');
    expect(body).toContain('formaction="?/guidedAcpStart"');
    expect(body).toContain("data-continuous-update-form");
    expect(body).toContain('name="continuousTrigger"');
    expect(body).toContain('name="continuousUserPrompt"');
    expect(body).toContain('name="continuousDocId"');
    expect(body).toContain('name="targetTaskIds"');
    expect(body).toContain('formaction="?/continuousUpdate"');
    expect(body).toContain("data-technical-planning-form");
    expect(body).toContain('name="technicalSource"');
    expect(body).toContain('name="technicalUserPrompt"');
    expect(body).toContain('name="prototypePaths"');
    expect(body).toContain('name="boilerplatePaths"');
    expect(body).toContain('name="successCriteria"');
    expect(body).toContain('formaction="?/generate"');
    expect(body).toContain("data-workflow-cycle-form");
    expect(body).toContain('name="workflowCycleJson"');
    expect(body).toContain('formaction="?/workflowCycle"');
  });

  test("renders trace-linked preview output from the server action only", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: { ok: true, mode: "preview", preview: BREAKDOWN },
      },
    });

    expect(body).toContain("data-planning-preview");
    expect(body).toContain("Approved Plan");
    expect(body).toContain("Build planning route");
    expect(body).toContain("trace_1");
    expect(body).toContain("Web preserves trace ids.");
    expect(body).toContain("No prototype artifacts were declared.");
  });

  test("renders freeform-doc ACP planning prompt returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "freeformPrompt",
          freeformPrompt: {
            context: {
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              selectedDocs: [{
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                title: "Brief",
                breadcrumb: "Workspace / Brief",
                versionId: "version-1",
                updatedAt: "2026-05-15T00:00:00.000Z",
                truncated: true,
              }],
              contextMarkdown: "## Freeform Document: Brief",
            },
            prompt: "Use freeform docs.\n\nsubmit_plan",
          },
        },
      },
    });

    expect(body).toContain("data-freeform-planning-prompt");
    expect(body).toContain("data-planning-context-sources");
    expect(body).toContain('data-planning-context-doc="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
    expect(body).toContain("Workspace / Brief");
    expect(body).toContain("version-1");
    expect(body).toContain("truncated");
    expect(body).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body).toContain("Use freeform docs.");
    expect(body).toContain("submit_plan");
  });

  test("renders started freeform work doc and returned ACP planning prompt", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "freeformStart",
          freeformStart: {
            status: "ready_for_planning",
            document: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "New work brief" },
            context: {
              sourceRefs: [{ kind: "doc", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
              contextMarkdown: "## Freeform Document: New work brief",
            },
            prompt: "ACP prompt with submit_plan",
          },
        },
      },
    });

    expect(body).toContain("data-freeform-work-start");
    expect(body).toContain("New work brief");
    expect(body).toContain("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(body).toContain("ACP prompt with submit_plan");
  });

  test("renders guided ACP planning session returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "guidedAcpStart",
          guidedAcpStart: {
            status: "ready_for_acp_prompt",
            session: {
              acpSessionId: "acp-guided-web",
              projectId: "project-web",
              traceId: "trace_guided_acp",
              agentName: "codex",
              modeId: "planning",
              modelId: "gpt-5.5",
              permissionMode: "review_each_tool",
            },
            permissionOptions: [{ optionId: "allow_once", name: "Allow once" }],
            traffic: { entries: [{ method: "session/new" }, { method: "session/prompt" }] },
            context: {
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              contextMarkdown: "## Freeform Document: Brief",
            },
            prompt: "ACP guided session with submit_plan",
          },
        },
      },
    });

    expect(body).toContain("data-guided-acp-start");
    expect(body).toContain("acp-guided-web");
    expect(body).toContain("codex");
    expect(body).toContain("planning");
    expect(body).toContain("gpt-5.5");
    expect(body).toContain("review_each_tool");
    expect(body).toContain("session/new");
    expect(body).toContain("data-guided-acp-session-actions");
    expect(body).toContain('formaction="?/guidedAcpSessionAction"');
    expect(body).toContain('name="acpSessionAction" value="resume_session"');
    expect(body).toContain('name="acpSessionAction" value="cancel_operation"');
    expect(body).toContain('name="acpSessionAction" value="resolve_permission"');
    expect(body).toContain('name="acpSessionAction" value="cancel_permission"');
    expect(body).toContain("ACP guided session with submit_plan");
  });

  test("renders guided ACP session action result returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "guidedAcpSessionAction",
          guidedAcpSessionAction: {
            status: "session_action_recorded",
            session: {
              acpSessionId: "acp-guided-web",
              projectId: "project-web",
              traceId: "trace_guided_acp",
              agentName: "codex",
              modeId: "review",
              modelId: "gpt-5.5",
              sessionStatus: "selector_updated",
            },
            action: { type: "set_mode", method: "session/set_mode", modeId: "review" },
            traffic: { entries: [{ method: "session/new" }, { method: "session/set_mode" }] },
          },
        },
      },
    });

    expect(body).toContain("data-guided-acp-session-action");
    expect(body).toContain("session_action_recorded");
    expect(body).toContain("acp-guided-web");
    expect(body).toContain("selector_updated");
    expect(body).toContain("session/set_mode");
  });

  test("renders continuous update replanning prompt returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "continuousUpdate",
          continuousUpdate: {
            status: "ready_for_replanning",
            traceId: "trace_continuous_web",
            acpSessionId: "acp-session-web",
            targetTaskIds: ["task-alpha", "task-beta"],
            targetTasks: [{ id: "task-alpha", title: "Task alpha", status: "blocked" }],
            missingTargetTaskIds: ["task-beta"],
            changedDocs: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Updated web brief" }],
            context: {
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              contextMarkdown: "## Freeform Document: Updated web brief",
            },
            prompt: "Continue the Fulcrum workflow cycle\n\nsubmit_plan",
          },
        },
      },
    });

    expect(body).toContain("data-continuous-update");
    expect(body).toContain("ready_for_replanning");
    expect(body).toContain("trace_continuous_web");
    expect(body).toContain("acp-session-web");
    expect(body).toContain("data-planning-task-reconciliation");
    expect(body).toContain("data-reconciliation-target-id");
    expect(body).toContain("Task alpha");
    expect(body).toContain("blocked");
    expect(body).toContain("Missing task-beta");
    expect(body).toContain("data-reconciliation-changed-doc");
    expect(body).toContain("task-alpha");
    expect(body).toContain("Updated web brief");
    expect(body).toContain("Continue the Fulcrum workflow cycle");
    expect(body).toContain("submit_plan");
  });

  test("renders generated technical planning review data returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "generate",
          technicalPlanning: {
            status: "ready_for_plan_review",
            eventId: "event-technical-planning",
            reviewPrompt: "Review this generated technical plan",
            plan: {
              planId: "technical-plan-web",
              reviewId: "technical-review-web",
              title: "Plan from web context",
              traceId: "trace_technical_web",
              source: "freeform_docs",
              markdown: "# Plan from web context",
              prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
              boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
            },
            artifactPreviews: [{
              id: "prototype-apps-web-src-routes-planning-workbench-prototype-tsx",
              kind: "prototype",
              path: "apps/web/src/routes/planning/workbench-prototype.tsx",
              label: "prototype: workbench-prototype.tsx",
              mode: "source-module",
              run: { command: "bun", args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'] },
              reviewChecks: ["Prototype demonstrates the intended user flow before task materialization."],
            }],
            breakdown: BREAKDOWN,
          },
        },
      },
    });

    expect(body).toContain("data-technical-planning");
    expect(body).toContain("ready_for_plan_review");
    expect(body).toContain("technical-plan-web");
    expect(body).toContain("trace_technical_web");
    expect(body).toContain("apps/web/src/routes/planning/workbench-prototype.tsx");
    expect(body).toContain("services/planning-review/src/application/technical-planning-cycle.ts");
    expect(body).toContain("data-planning-artifact-previews");
    expect(body).toContain('data-planning-artifact-preview="prototype-apps-web-src-routes-planning-workbench-prototype-tsx"');
    expect(body).toContain("data-planning-artifact-run-form");
    expect(body).toContain('name="artifactPlanId" value="technical-plan-web"');
    expect(body).toContain('name="artifactArgs" value="[&quot;-e&quot;,&quot;await import(\\&quot;./apps/web/src/routes/planning/workbench-prototype.tsx\\&quot;)&quot;]"');
    expect(body).toContain("prototype: workbench-prototype.tsx");
    expect(body).toContain("source-module");
    expect(body).toContain("bun -e await import");
    expect(body).toContain("Prototype demonstrates the intended user flow");
    expect(body).toContain("Review this generated technical plan");
    expect(body).toContain("Build planning route");
  });

  test("renders artifact execution result history returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "artifactExecution",
          artifactExecution: {
            planId: "technical-plan-web",
            artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
            status: "passed",
            prototypeStatus: "validated",
            traceId: "trace_technical_web",
            command: "bun",
            args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
            runner: "sandbox-agent",
            runId: "artifact-run-web",
            exitCode: 0,
            durationMs: 25,
            summary: "Artifact command completed in the sandbox runner.",
            outputRef: "/tmp/fulcrum-agent-run/transcripts/artifact-run.jsonl",
            history: [{
              status: "ready",
              prototypeStatus: "ready",
              command: "bun",
              args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
              summary: "Artifact execution is ready to run.",
              executedAt: "2026-05-15T12:00:00.000Z",
            }, {
              status: "passed",
              prototypeStatus: "validated",
              command: "bun",
              args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
              summary: "Artifact command completed in the sandbox runner.",
              outputRef: "/tmp/fulcrum-agent-run/transcripts/artifact-run.jsonl",
              executedAt: "2026-05-15T12:01:00.000Z",
            }],
          },
        },
      },
    });

    expect(body).toContain("data-planning-artifact-execution");
    expect(body).toContain("data-planning-artifact-execution-history");
    expect(body).toContain("data-planning-artifact-execution-history-item");
    expect(body).toContain("apps/web/src/routes/planning/workbench-prototype.tsx");
    expect(body).toContain("passed");
    expect(body).toContain("validated");
    expect(body).toContain("sandbox-agent");
    expect(body).toContain("artifact-run-web");
    expect(body).toContain("exit 0");
    expect(body).toContain("Artifact command completed in the sandbox runner.");
    expect(body).toContain("/tmp/fulcrum-agent-run/transcripts/artifact-run.jsonl");
    expect(body).toContain("2026-05-15T12:00:00.000Z");
    expect(body).toContain("2026-05-15T12:01:00.000Z");
  });

  test("renders full workflow cycle result returned from the server action", () => {
    const { body } = render(Page, {
      props: {
        data: { defaultPlanId: "plan_web", defaultTraceId: "trace_web" },
        form: {
          ok: true,
          mode: "workflowCycle",
          workflowCycle: {
            traceId: "trace_web_cycle",
            finalQa: { status: "passed" },
            generatedE2e: {
              status: "planned",
              testFiles: ["tests/e2e/generated/web-cycle.test.ts"],
            },
          },
        },
      },
    });

    expect(body).toContain("data-workflow-cycle-result");
    expect(body).toContain("trace_web_cycle");
    expect(body).toContain("passed");
    expect(body).toContain("planned");
    expect(body).toContain("tests/e2e/generated/web-cycle.test.ts");
  });
});
