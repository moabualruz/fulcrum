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

type PageProps = {
  data: { defaultPlanId: string; defaultTraceId: string };
  form?: {
    ok: boolean;
    mode: "preview" | "materialize" | "freeformPrompt" | "freeformStart" | "guidedAcpStart" | "continuousUpdate" | "generate" | "workflowCycle";
    preview?: typeof BREAKDOWN;
    freeformStart?: {
      status: "ready_for_planning";
      document: { id: string; title: string };
      context: {
        sourceRefs: Array<{ kind: "doc"; id: string }>;
        contextMarkdown: string;
      };
      prompt: string;
    };
    freeformPrompt?: {
      context: {
        sourceRefs: Array<{ kind: "doc"; id: string }>;
        contextMarkdown: string;
      };
      prompt: string;
    };
    guidedAcpStart?: {
      status: "ready_for_acp_prompt";
      session: {
        acpSessionId: string;
        agentName: string;
        modeId: string;
        modelId?: string;
        permissionMode: string;
      };
      permissionOptions: Array<{ optionId: string; name: string }>;
      traffic: { entries: Array<{ method: string }> };
      context: {
        sourceRefs: Array<{ kind: "doc"; id: string }>;
        contextMarkdown: string;
      };
      prompt: string;
    };
    continuousUpdate?: {
      status: "ready_for_replanning";
      traceId?: string;
      acpSessionId?: string;
      targetTaskIds: string[];
      changedDocs: Array<{ id: string; title: string }>;
      context: {
        sourceRefs: Array<{ kind: "doc"; id: string }>;
        contextMarkdown: string;
      };
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
              contextMarkdown: "## Freeform Document: Brief",
            },
            prompt: "Use freeform docs.\n\nsubmit_plan",
          },
        },
      },
    });

    expect(body).toContain("data-freeform-planning-prompt");
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
    expect(body).toContain("ACP guided session with submit_plan");
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
    expect(body).toContain("Review this generated technical plan");
    expect(body).toContain("Build planning route");
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
