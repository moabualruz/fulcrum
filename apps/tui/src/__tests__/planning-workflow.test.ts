import { describe, expect, test } from "bun:test";

import { PlanningBreakdownScreen } from "../screens/planning-breakdown.ts";
import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { TuiApp, type TuiCaller } from "../index.ts";
import type { WorkflowAcceptanceCycleInput } from "@workflow-coordination/application/workflow-acceptance-cycle.ts";

describe("TUI planning workflow", () => {
  test("planning breakdown delegates approved plan preview, materialization, and freeform context to caller", async () => {
    const calls: unknown[] = [];
    const materializeCalls: unknown[] = [];
    const freeformCalls: unknown[] = [];
    const freeformStartCalls: unknown[] = [];
    const guidedAcpCalls: unknown[] = [];
    const guidedAcpActionCalls: unknown[] = [];
    const continuousUpdateCalls: unknown[] = [];
    const technicalPlanningCalls: unknown[] = [];
    const workflowCycleCalls: unknown[] = [];
    const artifactExecutionCalls: unknown[] = [];
    const screen = new PlanningBreakdownScreen({
      input: {
        planId: "plan_1",
        approvedPlanMarkdown: "# Approved Plan",
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_1",
        sourceDocRefs: [{ kind: "doc", id: "doc_1" }],
      },
      freeformInput: {
        userPrompt: "Plan from freeform docs",
        selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        traceId: "trace_freeform",
      },
      freeformStartInput: {
        title: "TUI freeform brief",
        bodyMd: "Prototype first from TUI.",
        userPrompt: "Plan from TUI intake.",
        traceId: "trace_tui_freeform_start",
        acpSessionId: "acp-session-tui",
        modeId: "planning",
        modelId: "gpt-5.4",
      },
      guidedAcpInput: {
        acpSessionId: "acp-guided-tui",
        agentName: "codex",
        cwd: "/repo",
        userPrompt: "Plan with guided ACP from TUI.",
        promptTemplateId: "prototype-first",
        selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        traceId: "trace_guided_acp_tui",
        modeId: "planning",
        modelId: "gpt-5.5",
        permissionMode: "review_each_tool",
      },
      guidedAcpSessionActionInput: {
        acpSessionId: "acp-guided-tui",
        action: "resolve_permission",
        projectId: "project-1",
        traceId: "trace_guided_acp_tui",
        optionId: "allow_once",
      },
      continuousUpdateInput: {
        trigger: "manual_doc_edit",
        userPrompt: "Replan from updated TUI docs.",
        selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        targetTaskIds: ["task-alpha", "task-beta"],
        changedDocs: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Updated TUI brief",
          bodyMd: "Updated context from TUI.",
        }],
        traceId: "trace_continuous_tui",
        acpSessionId: "acp-session-tui",
        modeId: "planning",
        modelId: "gpt-5.5",
      },
      technicalPlanningInput: {
        source: "freeform_docs",
        userPrompt: "Generate a technical plan from TUI context.",
        selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        traceId: "trace_technical_tui",
        planId: "technical-plan-tui",
        reviewId: "technical-review-tui",
        prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
        boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
        successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
      },
      artifactExecutionInput: {
        planId: "technical-plan-tui",
        artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
        traceId: "trace_artifact_tui",
        command: "bun",
        args: ["test", "apps/web/src/routes/planning/page.svelte.test.ts"],
        checks: ["Prototype renders"],
        timeoutMs: 120000,
      },
      workflowCycleInput: {
        workspace: { id: "workspace-tui-cycle", slug: "tui-cycle", name: "TUI Cycle" },
        project: {
          id: "project-tui-cycle",
          slug: "tui-cycle",
          name: "TUI Cycle",
          traceId: "trace_workflow_cycle_tui",
        },
        freeform: {
          documentId: "doc-tui-cycle",
          title: "TUI freeform cycle brief",
          bodyMd: "Start from rough docs and run through approval.",
          userPrompt: "Plan and execute this workflow.",
        },
        guidedPlanning: {
          acpSessionId: "acp-tui-cycle",
          agentName: "codex",
          cwd: "/repo",
          modeId: "planning",
          modelId: "gpt-5.4",
          permissionMode: "review_each_tool",
        },
        approvedPlan: {
          planId: "plan-tui-cycle",
          reviewId: "review-tui-cycle",
          markdown: "# Plan\n\n## Tasks\n- [context] Preserve context",
        },
        execution: {
          agent: "codex",
          model: "gpt-5.4",
          prompt: "Run the dependency tree.",
          lifecycleSummary: "All tasks completed.",
          qaReviewText: "### Verdict: APPROVE\nAll criteria passed.",
          qaReviewType: "code",
        },
        uat: {
          decision: "approve_without_manual_review",
          reviewType: "uat",
          e2eRunner: "bun",
        },
      },
      caller: {
        planning: {
          previewApprovedPlanBreakdown: async (input: unknown) => {
            calls.push(input);
            return {
              title: "Approved Plan",
              docs: [{ clientKey: "plan-doc" }, { clientKey: "success-criteria-doc" }],
              taskDrafts: [
                { clientKey: "T1", input: { title: "Persist docs" }, blockedByClientKeys: [] },
                { clientKey: "T2", input: { title: "Create tasks" }, blockedByClientKeys: ["T1"] },
              ],
              warnings: ["Task T3 references unknown dependencies: T0"],
            };
          },
          materializeApprovedPlanBreakdown: async (input: unknown) => {
            materializeCalls.push(input);
            return {
              breakdown: {
                title: "Approved Plan",
                docs: [{ clientKey: "plan-doc" }],
                taskDrafts: [{ clientKey: "T1", input: { title: "Persist docs" }, blockedByClientKeys: [] }],
                warnings: [],
              },
              materialization: {
                docs: [{ clientKey: "plan-doc", id: "doc_1" }],
                tasks: [{ clientKey: "T1", id: "task_1" }],
                dependencyUpdates: [],
              },
            };
          },
          buildFreeformDocsPlanningPrompt: async (input: unknown) => {
            freeformCalls.push(input);
            return {
              context: {
                traceId: "trace_freeform",
                sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                selectedDocs: [],
                contextMarkdown: "## Freeform Document: Brief",
              },
              prompt: "ACP prompt with submit_plan",
            };
          },
          startFreeformWorkFromDocs: async (input: unknown) => {
            freeformStartCalls.push(input);
            return {
              status: "ready_for_planning",
              eventId: "event-tui-freeform-start",
              document: {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                title: "TUI freeform brief",
              },
              context: {
                traceId: "trace_tui_freeform_start",
                sourceRefs: [{ kind: "doc", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
                contextMarkdown: "## Freeform Document: TUI freeform brief",
              },
              prompt: "TUI ACP prompt with submit_plan",
            };
          },
          startGuidedAcpPlanningSession: async (input: unknown) => {
            guidedAcpCalls.push(input);
            return {
              status: "ready_for_acp_prompt",
              eventId: "event-tui-guided-acp",
              session: {
                acpSessionId: "acp-guided-tui",
                agentName: "codex",
                cwd: "/repo",
                promptTemplateId: "prototype-first",
                traceId: "trace_guided_acp_tui",
                modeId: "planning",
                modelId: "gpt-5.5",
                permissionMode: "review_each_tool",
                availableModes: [{ id: "planning", name: "Planning" }],
                availableModels: [{ modelId: "gpt-5.5", name: "gpt-5.5" }],
              },
              permissionOptions: [{ optionId: "allow_once", kind: "allow", name: "Allow once" }],
              traffic: { entries: [{ method: "session/new" }, { method: "session/prompt" }] },
              context: {
                traceId: "trace_guided_acp_tui",
                sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                contextMarkdown: "## Freeform Document: Brief",
              },
              prompt: "TUI guided ACP prompt with submit_plan",
            };
          },
          recordGuidedAcpSessionAction: async (input: unknown) => {
            guidedAcpActionCalls.push(input);
            return {
              status: "session_action_recorded",
              session: {
                acpSessionId: "acp-guided-tui",
                traceId: "trace_guided_acp_tui",
                agentName: "codex",
                modeId: "planning",
                sessionStatus: "permission_resolved",
              },
              action: {
                type: "resolve_permission",
                method: "session/request_permission",
                optionId: "allow_once",
              },
              traffic: {
                entries: [
                  { method: "session/new" },
                  { method: "session/request_permission" },
                ],
              },
            };
          },
          restartPlanningCycleFromUpdates: async (input: unknown) => {
            continuousUpdateCalls.push(input);
            return {
              status: "ready_for_replanning",
              trigger: "manual_doc_edit",
              eventId: "event-tui-continuous-update",
              traceId: "trace_continuous_tui",
              acpSessionId: "acp-session-tui",
              targetTaskIds: ["task-alpha", "task-beta"],
              changedDocs: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Updated TUI brief" }],
              context: {
                traceId: "trace_continuous_tui",
                sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                contextMarkdown: "## Freeform Document: Updated TUI brief",
              },
              prompt: "Continue the Fulcrum workflow cycle\n\nsubmit_plan",
            };
          },
          generateTechnicalPlanningCycle: async (input: unknown) => {
            technicalPlanningCalls.push(input);
            return {
              status: "ready_for_plan_review",
              eventId: "event-tui-technical-planning",
              context: {
                traceId: "trace_technical_tui",
                sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                contextMarkdown: "## Freeform Document: Brief",
              },
              prompt: "Generate a technical plan with submit_plan",
              reviewPrompt: "Review this generated technical plan",
              plan: {
                planId: "technical-plan-tui",
                reviewId: "technical-review-tui",
                title: "Generate a technical plan from TUI context",
                traceId: "trace_technical_tui",
                source: "freeform_docs",
                markdown: "# Generate a technical plan from TUI context",
                prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
                boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
                sourceDocRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              },
              breakdown: {
                title: "Generate a technical plan from TUI context",
                docs: [],
                artifacts: [],
                successCriteria: [],
                taskDrafts: [{ clientKey: "T1", input: { title: "Generate plan" }, blockedByClientKeys: [] }],
                dependencyUpdates: [],
                warnings: [],
              },
            };
          },
          runArtifactExecution: async (input: unknown) => {
            artifactExecutionCalls.push(input);
            return {
              status: "passed",
              runner: "sandbox-agent",
              runId: "run-artifact-tui",
              exitCode: 0,
              durationMs: 1250,
              traceId: "trace_artifact_tui",
              summary: "Prototype rendered.",
              outputRef: "artifacts/planning/run-artifact-tui.log",
              transcript: "ok\nCOMPLETE",
              history: [{
                status: "passed",
                traceId: "trace_artifact_tui",
                summary: "Prototype rendered.",
                outputRef: "artifacts/planning/run-artifact-tui.log",
                executedAt: "2026-05-15T10:00:00.000Z",
              }],
            };
          },
        },
        workflows: {
          runAcceptanceCycle: async (input: WorkflowAcceptanceCycleInput) => {
            workflowCycleCalls.push(input);
            return {
              traceId: "trace_workflow_cycle_tui",
              finalQa: { status: "passed" },
              generatedE2e: {
                status: "planned",
                testFiles: ["tests/e2e/generated/tui-cycle.test.ts"],
              },
            };
          },
        },
      },
    });

    await screen.load();
    const tty = new FakeTTY({ columns: 120, rows: 30 });
    const renderer = new Renderer(tty);
    screen.render(renderer);

    expect(calls).toEqual([{
      planId: "plan_1",
      approvedPlanMarkdown: "# Approved Plan",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_1",
      sourceDocRefs: [{ kind: "doc", id: "doc_1" }],
    }]);
    expect(tty.plainText()).toContain("Approved Plan");
    expect(tty.plainText()).toContain("trace_1");
    expect(tty.plainText()).toContain("T2");
    expect(tty.plainText()).toContain("blocked by T1");
    expect(tty.plainText()).toContain("Task T3 references unknown dependencies");

    await screen.handleKey("m");
    tty.clear();
    screen.render(renderer);

    expect(materializeCalls).toEqual([{
      planId: "plan_1",
      approvedPlanMarkdown: "# Approved Plan",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_1",
      sourceDocRefs: [{ kind: "doc", id: "doc_1" }],
    }]);
    expect(tty.plainText()).toContain("Materialized");
    expect(tty.plainText()).toContain("doc_1");
    expect(tty.plainText()).toContain("task_1");

    await screen.handleKey("c");
    tty.clear();
    screen.render(renderer);

    expect(freeformCalls).toEqual([{
      userPrompt: "Plan from freeform docs",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      traceId: "trace_freeform",
    }]);
    expect(tty.plainText()).toContain("Freeform context");
    expect(tty.plainText()).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(tty.plainText()).toContain("ACP prompt with submit_plan");

    await screen.handleKey("n");
    tty.clear();
    screen.render(renderer);

    expect(freeformStartCalls).toEqual([{
      title: "TUI freeform brief",
      bodyMd: "Prototype first from TUI.",
      userPrompt: "Plan from TUI intake.",
      traceId: "trace_tui_freeform_start",
      acpSessionId: "acp-session-tui",
      modeId: "planning",
      modelId: "gpt-5.4",
    }]);
    expect(tty.plainText()).toContain("Freeform work started");
    expect(tty.plainText()).toContain("TUI freeform brief");
    expect(tty.plainText()).toContain("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(tty.plainText()).toContain("TUI ACP prompt with submit_plan");

    await screen.handleKey("a");
    tty.clear();
    screen.render(renderer);

    expect(guidedAcpCalls).toEqual([{
      acpSessionId: "acp-guided-tui",
      agentName: "codex",
      cwd: "/repo",
      userPrompt: "Plan with guided ACP from TUI.",
      promptTemplateId: "prototype-first",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      traceId: "trace_guided_acp_tui",
      modeId: "planning",
      modelId: "gpt-5.5",
      permissionMode: "review_each_tool",
    }]);
    expect(tty.plainText()).toContain("Guided ACP session");
    expect(tty.plainText()).toContain("acp-guided-tui");
    expect(tty.plainText()).toContain("codex");
    expect(tty.plainText()).toContain("session/new");
    expect(tty.plainText()).toContain("TUI guided ACP prompt with submit_plan");

    await screen.handleKey("p");
    tty.clear();
    screen.render(renderer);

    expect(guidedAcpActionCalls).toEqual([{
      acpSessionId: "acp-guided-tui",
      action: "resolve_permission",
      projectId: "project-1",
      traceId: "trace_guided_acp_tui",
      optionId: "allow_once",
    }]);
    expect(tty.plainText()).toContain("Guided ACP action");
    expect(tty.plainText()).toContain("permission_resolved");
    expect(tty.plainText()).toContain("session/request_permission");

    await screen.handleKey("u");
    tty.clear();
    screen.render(renderer);

    expect(continuousUpdateCalls).toEqual([{
      trigger: "manual_doc_edit",
      userPrompt: "Replan from updated TUI docs.",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      targetTaskIds: ["task-alpha", "task-beta"],
      changedDocs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Updated TUI brief",
        bodyMd: "Updated context from TUI.",
      }],
      traceId: "trace_continuous_tui",
      acpSessionId: "acp-session-tui",
      modeId: "planning",
      modelId: "gpt-5.5",
    }]);
    expect(tty.plainText()).toContain("Continuous update");
    expect(tty.plainText()).toContain("trace_continuous_tui");
    expect(tty.plainText()).toContain("task-alpha");
    expect(tty.plainText()).toContain("Updated TUI brief");
    expect(tty.plainText()).toContain("Continue the Fulcrum workflow cycle");

    await screen.handleKey("g");
    tty.clear();
    screen.render(renderer);

    expect(technicalPlanningCalls).toEqual([{
      source: "freeform_docs",
      userPrompt: "Generate a technical plan from TUI context.",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      traceId: "trace_technical_tui",
      planId: "technical-plan-tui",
      reviewId: "technical-review-tui",
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
      successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
    }]);
    expect(tty.plainText()).toContain("Technical planning");
    expect(tty.plainText()).toContain("ready_for_plan_review");
    expect(tty.plainText()).toContain("technical-plan-tui");
    expect(tty.plainText()).toContain("trace_technical_tui");
    expect(tty.plainText()).toContain("apps/web/src/routes/planning/workbench-prototype.tsx");
    expect(tty.plainText()).toContain("Review this generated technical plan");

    await screen.handleKey("e");
    tty.clear();
    screen.render(renderer);

    expect(artifactExecutionCalls).toEqual([{
      planId: "technical-plan-tui",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace_technical_tui",
      command: "bun",
      args: ["test", "apps/web/src/routes/planning/page.svelte.test.ts"],
      checks: ["Prototype renders"],
      timeoutMs: 120000,
    }]);
    expect(tty.plainText()).toContain("Artifact execution");
    expect(tty.plainText()).toContain("passed");
    expect(tty.plainText()).toContain("sandbox-agent");
    expect(tty.plainText()).toContain("run-artifact-tui");
    expect(tty.plainText()).toContain("Prototype rendered.");
    expect(tty.plainText()).toContain("artifacts/planning/run-artifact-tui.log");

    await screen.handleKey("x");
    tty.clear();
    screen.render(renderer);

    expect(workflowCycleCalls).toEqual([{
      workspace: { id: "workspace-tui-cycle", slug: "tui-cycle", name: "TUI Cycle" },
      project: {
        id: "project-tui-cycle",
        slug: "tui-cycle",
        name: "TUI Cycle",
        traceId: "trace_workflow_cycle_tui",
      },
      freeform: {
        documentId: "doc-tui-cycle",
        title: "TUI freeform cycle brief",
        bodyMd: "Start from rough docs and run through approval.",
        userPrompt: "Plan and execute this workflow.",
      },
      guidedPlanning: {
        acpSessionId: "acp-tui-cycle",
        agentName: "codex",
        cwd: "/repo",
        modeId: "planning",
        modelId: "gpt-5.4",
        permissionMode: "review_each_tool",
      },
      approvedPlan: {
        planId: "plan-tui-cycle",
        reviewId: "review-tui-cycle",
        markdown: "# Plan\n\n## Tasks\n- [context] Preserve context",
      },
      execution: {
        agent: "codex",
        model: "gpt-5.4",
        prompt: "Run the dependency tree.",
        lifecycleSummary: "All tasks completed.",
        qaReviewText: "### Verdict: APPROVE\nAll criteria passed.",
        qaReviewType: "code",
      },
      uat: {
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      },
    }]);
    expect(tty.plainText()).toContain("Workflow cycle");
    expect(tty.plainText()).toContain("trace_workflow_cycle_tui");
    expect(tty.plainText()).toContain("passed");
    expect(tty.plainText()).toContain("tests/e2e/generated/tui-cycle.test.ts");
  });

  test("root navigation exposes planning breakdown and delegates through caller", async () => {
    const calls: unknown[] = [];
    const materializeCalls: unknown[] = [];
    const workflowCycleCalls: unknown[] = [];
    const artifactExecutionCalls: unknown[] = [];
    const planningInput = {
      planId: "plan_nav",
      approvedPlanMarkdown: "# Nav Approved Plan",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_nav",
      sourceDocRefs: [{ kind: "doc", id: "doc_nav" }],
    };
    const workflowCycleInput = {
      workspace: { id: "workspace-nav-cycle", slug: "nav-cycle", name: "Nav Cycle" },
      project: {
        id: "project-nav-cycle",
        slug: "nav-cycle",
        name: "Nav Cycle",
        traceId: "trace_nav_cycle",
      },
      freeform: {
        documentId: "doc-nav-cycle",
        title: "Nav cycle brief",
        bodyMd: "Run the full cycle from TUI navigation.",
        userPrompt: "Plan and execute this cycle.",
      },
      guidedPlanning: {
        acpSessionId: "acp-nav-cycle",
        agentName: "codex",
        cwd: "/repo",
      },
      approvedPlan: {
        planId: "plan-nav-cycle",
        reviewId: "review-nav-cycle",
        markdown: "# Plan",
      },
      execution: {
        agent: "codex",
        prompt: "Run dependencies.",
        lifecycleSummary: "Runs complete.",
        qaReviewText: "### Verdict: APPROVE\nApproved.",
      },
      uat: {
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      },
    } as const;
    const artifactExecutionInput = {
      planId: "plan-nav-cycle",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace_nav_artifact",
      planOnly: true,
    } as const;
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        ...makePlanningCaller(calls, materializeCalls, artifactExecutionCalls),
        workflows: {
          runAcceptanceCycle: async (input: WorkflowAcceptanceCycleInput) => {
            workflowCycleCalls.push(input);
            return {
              traceId: "trace_nav_cycle",
              finalQa: { status: "passed" },
              generatedE2e: {
                status: "planned",
                testFiles: ["tests/e2e/generated/nav-cycle.test.ts"],
              },
            } as never;
          },
        },
      },
      planningInput,
      planningArtifactExecutionInput: artifactExecutionInput,
      workflowCycleInput,
    } as never);

    await app.mount();
    expect(tty.plainText()).toContain("Planning");

    tty.clear();
    await app.navigateTo("planning" as never);

    expect(calls).toEqual([planningInput]);
    expect(tty.plainText()).toContain("Planning breakdown");
    expect(tty.plainText()).toContain("Nav Approved Plan");
    expect(tty.plainText()).toContain("trace_nav");
    expect(tty.plainText()).toContain("T2");
    expect(tty.plainText()).toContain("blocked by T1");

    tty.clear();
    tty.inject("m");
    await tick();

    expect(materializeCalls).toEqual([planningInput]);
    expect(tty.plainText()).toContain("Materialized");
    expect(tty.plainText()).toContain("doc_nav");
    expect(tty.plainText()).toContain("task_nav");

    tty.clear();
    tty.inject("e");
    await tick();

    expect(artifactExecutionCalls).toEqual([artifactExecutionInput]);
    expect(tty.plainText()).toContain("Artifact execution");
    expect(tty.plainText()).toContain("ready");
    expect(tty.plainText()).toContain("trace_nav_artifact");

    tty.clear();
    tty.inject("x");
    await tick();

    expect(workflowCycleCalls).toEqual([workflowCycleInput]);
    expect(tty.plainText()).toContain("Workflow cycle");
    expect(tty.plainText()).toContain("trace_nav_cycle");
    expect(tty.plainText()).toContain("tests/e2e/generated/nav-cycle.test.ts");

    app.stop();
  });

  test("artifact execution uses the latest technical plan artifact", async () => {
    const artifactExecutionCalls: unknown[] = [];
    const screen = new PlanningBreakdownScreen({
      input: {
        planId: "initial-plan",
        approvedPlanMarkdown: "# Approved Plan",
        traceId: "trace_initial",
      },
      technicalPlanningInput: {
        source: "freeform_docs",
        userPrompt: "Create executable artifacts.",
        traceId: "trace_technical_artifact",
        planId: "technical-plan",
        prototypePaths: ["apps/web/src/routes/planning/review-workbench.tsx"],
        boilerplatePaths: ["services/planning-review/src/application/review-scaffold.ts"],
        successCriteria: ["Technical artifact runs."],
      },
      artifactExecutionInput: {
        planId: "default-plan",
        artifactPath: "apps/web/src/routes/planning/default-prototype.tsx",
        traceId: "trace_default",
        planOnly: true,
      },
      caller: {
        planning: {
          previewApprovedPlanBreakdown: async () => ({
            title: "Approved Plan",
            taskDrafts: [],
          }),
          generateTechnicalPlanningCycle: async () => ({
            status: "ready_for_plan_review",
            prompt: "Create",
            reviewPrompt: "Review",
            plan: {
              planId: "technical-plan",
              title: "Technical plan",
              traceId: "trace_technical_artifact",
              source: "freeform_docs",
              markdown: "# Technical Plan",
              prototypePaths: ["apps/web/src/routes/planning/review-workbench.tsx"],
              boilerplatePaths: ["services/planning-review/src/application/review-scaffold.ts"],
            },
            breakdown: {
              title: "Technical plan",
              taskDrafts: [],
            },
          }),
          runArtifactExecution: async (input) => {
            artifactExecutionCalls.push(input);
            return {
              status: "ready",
              runner: "not-run",
              runId: null,
              exitCode: null,
              durationMs: 0,
              traceId: "trace_technical_artifact",
              summary: "Technical artifact is ready.",
              history: [],
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("g");
    await screen.handleKey("e");

    expect(artifactExecutionCalls).toEqual([{
      planId: "technical-plan",
      artifactPath: "apps/web/src/routes/planning/review-workbench.tsx",
      traceId: "trace_technical_artifact",
      planOnly: true,
    }]);
  });
});

function makePlanningCaller(
  calls: unknown[],
  materializeCalls: unknown[],
  artifactExecutionCalls: unknown[] = [],
): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "planning@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
    planning: {
      previewApprovedPlanBreakdown: async (input) => {
        calls.push(input);
        return {
          title: "Nav Approved Plan",
          docs: [{ clientKey: "plan-doc" }],
          taskDrafts: [
            { clientKey: "T1", input: { title: "Build docs" }, blockedByClientKeys: [], traceId: "trace_nav" },
            { clientKey: "T2", input: { title: "Build tasks" }, blockedByClientKeys: ["T1"], traceId: "trace_nav" },
          ],
          warnings: [],
        };
      },
      materializeApprovedPlanBreakdown: async (input) => {
        materializeCalls.push(input);
        return {
          breakdown: {
            title: "Nav Approved Plan",
            docs: [{ clientKey: "plan-doc" }],
            taskDrafts: [
              { clientKey: "T1", input: { title: "Build docs" }, blockedByClientKeys: [], traceId: "trace_nav" },
            ],
            warnings: [],
          },
          materialization: {
            docs: [{ clientKey: "plan-doc", id: "doc_nav" }],
            tasks: [{ clientKey: "T1", id: "task_nav" }],
            dependencyUpdates: [],
          },
        };
      },
      runArtifactExecution: async (input) => {
        artifactExecutionCalls.push(input);
        return {
          status: "ready",
          runner: "not-run",
          runId: null,
          exitCode: null,
          durationMs: 0,
          traceId: "trace_nav_artifact",
          summary: "Artifact execution is ready to run.",
          outputRef: null,
          transcript: "",
          history: [{ status: "ready", traceId: "trace_nav_artifact", summary: "Artifact execution is ready to run." }],
        };
      },
    },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
