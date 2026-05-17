import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { ReportsScreen } from "@fulcrum/tui/screens/reports.ts";
import { ActiveSprintBoardScreen, SprintPlanningScreen, SprintsListScreen } from "@fulcrum/tui/screens/sprints.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

const sprints = [
  { id: "sprint-1", name: "Sprint 1", status: "planned", startDate: "2026-05-04", endDate: "2026-05-15" },
  { id: "sprint-2", name: "Sprint 2", status: "active", startDate: "2026-05-18", endDate: "2026-05-29" },
  { id: "sprint-0", name: "Sprint 0", status: "completed", startDate: "2026-04-20", endDate: "2026-05-01" },
];

const tasks = [
  { id: "task-1", title: "Backlog task", status: "todo", points: 3 },
  { id: "task-2", title: "Sprint task", status: "in-progress", points: 5, sprintId: "sprint-1" },
  { id: "task-3", title: "Done sprint task", status: "done", points: 2, sprintId: "sprint-2" },
  { id: "task-4", title: "Todo sprint task", status: "todo", points: 8, sprintId: "sprint-2" },
];

describe("SprintsListScreen", () => {
  test("groups sprints by status, activates selected sprint with A, and opens create form with c", async () => {
    const activations: string[] = [];
    const screen = new SprintsListScreen({
      caller: {
        sprints: {
          list: async () => sprints,
          activate: async (input) => {
            activations.push(input.id);
            return { ok: true };
          },
          create: async (input) => ({ id: "sprint-new", status: "planned", ...input }),
        },
      },
    });

    await screen.load();
    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("PLANNED");
    expect(rendered).toContain("ACTIVE");
    expect(rendered).toContain("COMPLETED");

    await screen.handleKey("A");
    expect(activations).toEqual(["sprint-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sprint 1  [active]");

    await screen.handleKey("c");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Create sprint");
    await screen.submitCreate({ name: "Sprint 3", startDate: "2026-06-01", endDate: "2026-06-12" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sprint 3  [planned]");
  });
});

describe("SprintPlanningScreen", () => {
  test("moves backlog task into sprint with m, removes it with x, and updates capacity", async () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const screen = new SprintPlanningScreen({
      sprintId: "sprint-1",
      capacityPoints: 10,
      caller: {
        tasks: {
          list: async () => tasks,
        },
        sprints: {
          addTask: async (input) => {
            added.push(input);
            return { ok: true };
          },
          removeTask: async (input) => {
            removed.push(input);
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Capacity 5/10");

    await screen.handleKey("m");
    expect(added).toEqual([{ sprintId: "sprint-1", taskId: "task-1" }]);
    const moved = renderPlain((renderer) => screen.render(renderer));
    expect(moved).toContain("Capacity 8/10");
    expect(moved).toContain("Backlog task");

    await screen.handleKey("x");
    expect(removed).toEqual([{ sprintId: "sprint-1", taskId: "task-2" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Capacity 3/10");
  });
});

describe("ActiveSprintBoardScreen", () => {
  test("renders only sprint tasks, shows days remaining, quick-adds into sprint, and closes with disposition", async () => {
    const created: unknown[] = [];
    const closed: unknown[] = [];
    const retroEvents: unknown[] = [];
    const screen = new ActiveSprintBoardScreen({
      sprint: { id: "sprint-2", name: "Sprint 2", status: "active", endDate: "2026-05-29" },
      today: "2026-05-25",
      caller: {
        tasks: {
          list: async () => tasks,
          create: async (input) => {
            created.push(input);
            return { id: "task-new", title: String(input.title), status: "todo", sprintId: input.sprintId };
          },
        },
        sprints: {
          close: async (input) => {
            closed.push(input);
            return { ok: true };
          },
        },
        events: {
          emit: async (input) => {
            retroEvents.push(input);
          },
        },
      },
    });

    await screen.load();
    const board = renderPlain((renderer) => screen.render(renderer));
    expect(board).toContain("4 days remaining");
    expect(board).toContain("Done sprint task");
    expect(board).not.toContain("Backlog task");

    await screen.handleKey("c");
    await screen.submitQuickAdd("New sprint task");
    expect(created).toEqual([{ title: "New sprint task", status: "todo", sprintId: "sprint-2" }]);

    await screen.handleKey("C");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("2 incomplete tasks - move to: [Backlog] [Next Sprint]");
    await screen.submitClose("next-sprint");
    expect(closed).toEqual([{ sprintId: "sprint-2", incompleteDisposition: "next-sprint" }]);
    expect(retroEvents).toEqual([{ type: "retro.created", sprintId: "sprint-2" }]);
  });
});

describe("ReportsScreen", () => {
  test("switches reports with keys 1-6 and renders deterministic ASCII charts", async () => {
    const screen = new ReportsScreen({
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [
              { day: 1, ideal: 20, actual: 20 },
              { day: 2, ideal: 15, actual: 18 },
              { day: 3, ideal: 10, actual: 9 },
              { day: 4, ideal: 5, actual: 6 },
            ],
            velocity: [
              { sprint: "S1", points: 8 },
              { sprint: "S2", points: 13 },
              { sprint: "S3", points: 21 },
            ],
            cycleTime: [1, 2, 2, 3, 5],
            throughput: [2, 4, 3, 6, 5],
            wip: { todo: 4, inProgress: 2, review: 1, done: 8 },
            cfd: [
              { day: "Mon", todo: 5, inProgress: 2, done: 1 },
              { day: "Tue", todo: 3, inProgress: 4, done: 2 },
            ],
          }),
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Burndown");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("ideal | actual");

    await screen.handleKey("2");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("S3 | ##################### 21");
    await screen.handleKey("3");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("median: 2");
    await screen.handleKey("4");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Throughput");
    await screen.handleKey("5");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("inProgress: 2");
    await screen.handleKey("6");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Mon | TTTTT IIDD");
  });

  test("renders final QA report and switches to it with key 7", async () => {
    const screen = new ReportsScreen({
      finalQaInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_final_qa",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          finalQa: async (input) => ({
            projectId: input.projectId,
            traceId: input.traceId,
            status: "failed",
            readyForUserAcceptance: false,
            nextAction: "continue_automated_feedback",
            summary: {
              taskCount: 2,
              docCount: 1,
              runCount: 2,
              artifactCount: 1,
              successCriteriaCount: 3,
              approvedTaskCount: 1,
              blockedTaskCount: 1,
              openFeedbackRunCount: 1,
            },
            checks: [
              { id: "success-criteria-approved", label: "Success criteria approved", status: "fail", details: "1 task needs review" },
              { id: "docs-present", label: "Docs present", status: "pass", details: "1 project doc" },
            ],
            taskResults: [],
            markdown: "# Final QA Report\n\nStatus: failed",
          }),
        },
      },
    });

    await screen.load();
    await screen.handleKey("7");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Final QA");
    expect(rendered).toContain("status: failed");
    expect(rendered).toContain("next: continue_automated_feedback");
    expect(rendered).toContain("open feedback: 1");
    expect(rendered).toContain("success-criteria-approved [fail]");
  });

  test("renders final QA feedback gate and switches to it with key g", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const screen = new ReportsScreen({
      finalQaGateInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_final_qa_gate",
        workerId: "worker-tui",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        feedbackModel: "gpt-5.4",
        maxIterations: 4,
        cwd: "/tmp/fulcrum-work",
        copyToWorktree: ["apps/tui/src/screens/reports.ts"],
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          finalQaFeedbackGate: async (input) => {
            calls.push({ method: "finalQaFeedbackGate", input });
            return {
              projectId: input.projectId,
              traceId: input.traceId,
              loopAttempted: true,
              readyForUserAcceptance: true,
              nextAction: "prompt_uat_code_review",
              feedbackLoop: {
                iterations: 2,
                exhausted: true,
                stopReason: "automated_feedback_exhausted",
              },
              finalQa: {
                status: "passed",
                readyForUserAcceptance: true,
                nextAction: "prompt_uat_code_review",
                summary: {
                  taskCount: 2,
                  docCount: 1,
                  runCount: 3,
                  artifactCount: 1,
                  successCriteriaCount: 4,
                  approvedTaskCount: 2,
                  blockedTaskCount: 0,
                  openFeedbackRunCount: 0,
                },
              },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("g");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Final QA Gate");
    expect(rendered).toContain("loop: attempted");
    expect(rendered).toContain("stop: automated_feedback_exhausted");
    expect(rendered).toContain("iterations: 2");
    expect(calls).toEqual([{
      method: "finalQaFeedbackGate",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_final_qa_gate",
        workerId: "worker-tui",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        feedbackModel: "gpt-5.4",
        maxIterations: 4,
        cwd: "/tmp/fulcrum-work",
        copyToWorktree: ["apps/tui/src/screens/reports.ts"],
      },
    }]);
  });

  test("renders UAT/code review handoff and switches to it with key 8", async () => {
    const screen = new ReportsScreen({
      finalQaInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_uat",
      },
      uatHandoffInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_uat",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          finalQa: async (input) => ({
            projectId: input.projectId,
            traceId: input.traceId,
            status: "passed",
            readyForUserAcceptance: true,
            nextAction: "prompt_uat_code_review",
            summary: {
              taskCount: 1,
              docCount: 1,
              runCount: 1,
              artifactCount: 1,
              successCriteriaCount: 2,
              approvedTaskCount: 1,
              blockedTaskCount: 0,
              openFeedbackRunCount: 0,
            },
            checks: [],
            taskResults: [],
            markdown: "# Final QA Report\n\nStatus: passed",
          }),
          uatCodeReviewHandoff: async (input) => ({
            projectId: input.projectId,
            traceId: input.traceId,
            status: "ready",
            finalQaStatus: "passed",
            nextAction: "prompt_user_for_uat_code_review",
            reviewSessions: [
              { id: "uat-trace_tui_uat", type: "uat", status: "pending_user_decision" },
              { id: "code-review-trace_tui_uat", type: "code_review", status: "pending_user_decision" },
            ],
            decisionOptions: [
              { id: "start_uat", label: "Start UAT" },
              { id: "request_changes", label: "Request Changes" },
            ],
            promptMarkdown: "# UAT And Code Review Handoff",
          }),
        },
      },
    });

    await screen.load();
    await screen.handleKey("8");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("UAT / Code Review");
    expect(rendered).toContain("status: ready");
    expect(rendered).toContain("next: prompt_user_for_uat_code_review");
    expect(rendered).toContain("uat-trace_tui_uat [uat]");
    expect(rendered).toContain("start_uat");
  });

  test("renders UAT/code review decision and generated E2E artifact with key 9", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      uatDecisionInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_approval",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedbackText: "Approved",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          recordUatCodeReviewDecision: async (input) => {
            calls.push(input);
            return {
              projectId: input.projectId,
              traceId: input.traceId,
              decision: input.decision,
              reviewType: input.reviewType,
              status: "approved",
              nextAction: "real_data_e2e_generated",
              generatedE2eTests: [{
                artifactId: "artifact-e2e",
                filename: "uat-trace_tui_approval.spec.ts",
                path: "generated/e2e/uat-trace_tui_approval.spec.ts",
                runner: "playwright",
                storePath: "org/project/run/uat-trace_tui_approval.spec.ts",
                bodyPath: "/tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_approval.spec.ts",
                coverageCases: [{
                  id: "task-1:1",
                  criterion: "TUI shows generated coverage cases.",
                }],
              }],
              feedbackRuns: [],
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("9");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("UAT Decision");
    expect(rendered).toContain("status: approved");
    expect(rendered).toContain("next: real_data_e2e_generated");
    expect(rendered).toContain("uat-trace_tui_approval.spec.ts");
    expect(rendered).toContain("runner: playwright");
    expect(rendered).toContain("coverage: 1 case(s)");
    expect(rendered).toContain("/tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_approval.spec.ts");
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_tui_approval",
      decision: "approve_without_manual_review",
      reviewType: "uat",
      feedbackText: "Approved",
    }]);
  });

  test("renders configured auto-decision results and switches to it with key a", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      autoDecisionInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_auto",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          applyConfiguredUatCodeReviewDecision: async (input) => {
            calls.push(input);
            return {
              projectId: input.projectId,
              traceId: input.traceId,
              settingKey: "reports.uatCodeReviewAutoDecision",
              status: "applied",
              nextAction: "real_data_e2e_generated",
              config: {
                enabled: true,
                decision: "approve_without_manual_review",
                reviewType: "code_review",
              },
              decision: {
                status: "approved",
                generatedE2eTests: [{
                  artifactId: "artifact-auto-e2e",
                  filename: "uat-trace_tui_auto.spec.ts",
                  path: "generated/e2e/uat-trace_tui_auto.spec.ts",
                  runner: "bun",
                  storePath: "org/project/run/uat-trace_tui_auto.spec.ts",
                  bodyPath: "/tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_auto.spec.ts",
                  coverageCases: [{ id: "task-1:1", criterion: "TUI renders auto-decision coverage." }],
                }],
              },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("a");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Auto Decision");
    expect(rendered).toContain("status: applied");
    expect(rendered).toContain("next: real_data_e2e_generated");
    expect(rendered).toContain("setting: reports.uatCodeReviewAutoDecision");
    expect(rendered).toContain("decision: approve_without_manual_review [code_review]");
    expect(rendered).toContain("uat-trace_tui_auto.spec.ts");
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_tui_auto",
    }]);
  });

  test("renders generated E2E runner results and switches to it with key 0", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      e2eRunInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_approval",
        runner: "playwright",
        planOnly: true,
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          runGeneratedE2eRegressionTests: async (input) => {
            calls.push(input);
            return {
              projectId: input.projectId,
              traceId: input.traceId,
              runner: input.runner,
              status: "planned",
              command: ["bun", "run", "web:e2e:generated", "--", "/tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_approval.spec.ts"],
              cwd: "apps/web",
              testFiles: ["/tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_approval.spec.ts"],
              artifactIds: ["artifact-e2e"],
              stdout: "",
              stderr: "",
              exitCode: null,
              ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
              ciEnv: { FULCRUM_GENERATED_E2E_RUNNER: "playwright" },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("0");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Generated E2E Run");
    expect(rendered).toContain("status: planned");
    expect(rendered).toContain("runner: playwright");
    expect(rendered).toContain("cwd: apps/web");
    expect(rendered).toContain("bun run web:e2e:generated -- /tmp/fulcrum-artifacts/org/project/run/uat-trace_tui_approval.spec.ts");
    expect(rendered).toContain("ci: bun run scripts/ci-generated-e2e.ts");
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_tui_approval",
      runner: "playwright",
      planOnly: true,
    }]);
  });

  test("renders review workbench review workbench state and switches to it with key r", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      reviewWorkbenchInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_tui_review",
        reviewId: "review_tui_1",
        files: [],
        annotations: [],
        searchQuery: "trace",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          reviewWorkbench: async (input) => {
            calls.push(input);
            return {
              projectId: "99999999-9999-4999-8999-999999999999",
              traceId: "trace_tui_review",
              reviewId: "review_tui_1",
              summary: {
                fileCount: 2,
                visibleFileCount: 1,
                viewedFileCount: 1,
                annotationCount: 2,
                blockingAnnotationCount: 1,
                suggestionCount: 1,
                searchMatchCount: 3,
                hasLiveOutput: true,
              },
              visibleFiles: [{ path: "src/app.ts", annotationCount: 2, searchMatchCount: 3, viewed: false }],
              annotationGroups: [{ filePath: "src/app.ts", blockingCount: 1, suggestionCount: 1, annotations: [] }],
              search: { query: "trace", groups: [{ filePath: "src/app.ts", matches: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] }] },
              suggestions: [{ annotationId: "ann-suggestion", filePath: "src/app.ts", lineStart: 2, lineEnd: 2, canApply: true }],
              submission: { targets: [{ prRepo: "acme/fulcrum", annotationCount: 2 }], orphans: [{ reason: "full-stack", annotations: [{}] }] },
              liveLog: { displayText: "running trace review", truncated: false, isWaiting: false },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("r");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_tui_review",
      reviewId: "review_tui_1",
      files: [],
      annotations: [],
      searchQuery: "trace",
    }]);
    expect(rendered).toContain("Review Workbench");
    expect(rendered).toContain("trace: trace_tui_review");
    expect(rendered).toContain("files: 2 visible: 1 viewed: 1");
    expect(rendered).toContain("annotations: 2 blocking: 1 suggestions: 1");
    expect(rendered).toContain("search: trace matches: 3");
    expect(rendered).toContain("src/app.ts annotations: 2 matches: 3");
    expect(rendered).toContain("targets: 1 orphans: 1");
    expect(rendered).toContain("running trace review");
  });

  test("renders persisted review session state and switches to it with key s", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      reviewSessionInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        reviewId: "review_tui_session",
        searchQuery: "trace",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          loadReviewWorkbenchSession: async (input) => {
            calls.push(input);
            return {
              projectId: "99999999-9999-4999-8999-999999999999",
              traceId: "trace_tui_review_session",
              reviewId: "review_tui_session",
              reviewType: "code_review",
              title: "TUI persisted review",
              status: "loaded",
              revision: 3,
              eventId: "event-tui-review-session",
              model: {
                summary: {
                  fileCount: 2,
                  visibleFileCount: 2,
                  viewedFileCount: 0,
                  annotationCount: 2,
                  blockingAnnotationCount: 1,
                  suggestionCount: 1,
                  searchMatchCount: 4,
                  hasLiveOutput: false,
                },
              },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("s");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      reviewId: "review_tui_session",
      searchQuery: "trace",
    }]);
    expect(rendered).toContain("Review Session");
    expect(rendered).toContain("status: loaded");
    expect(rendered).toContain("review: review_tui_session");
    expect(rendered).toContain("trace: trace_tui_review_session");
    expect(rendered).toContain("revision: 3");
    expect(rendered).toContain("files: 2 visible: 2 viewed: 0");
    expect(rendered).toContain("annotations: 2 blocking: 1 suggestions: 1");
    expect(rendered).toContain("search matches: 4");
  });

  test("appends persisted review session annotations and renders annotated session state with key s", async () => {
    const calls: unknown[] = [];
    const screen = new ReportsScreen({
      reviewAnnotationInput: {
        projectId: "99999999-9999-4999-8999-999999999999",
        reviewId: "review_tui_session",
        annotationId: "ann-tui-inline",
        type: "suggestion",
        filePath: "src/app.ts",
        lineStart: 2,
        lineEnd: 2,
        side: "new",
        text: "Inline TUI review note.",
        suggestedCode: "trace()",
        searchQuery: "trace",
      },
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [],
            velocity: [],
            cycleTime: [],
            throughput: [],
            wip: {},
            cfd: [],
          }),
          appendReviewWorkbenchAnnotation: async (input) => {
            calls.push(input);
            return {
              projectId: "99999999-9999-4999-8999-999999999999",
              traceId: "trace_tui_review_session",
              reviewId: "review_tui_session",
              reviewType: "code_review",
              title: "TUI persisted review",
              status: "annotated",
              revision: 4,
              eventId: "event-tui-review-annotation",
              model: {
                summary: {
                  fileCount: 2,
                  visibleFileCount: 2,
                  viewedFileCount: 0,
                  annotationCount: 3,
                  blockingAnnotationCount: 1,
                  suggestionCount: 2,
                  searchMatchCount: 4,
                  hasLiveOutput: false,
                },
              },
            };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("s");

    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(calls).toEqual([{
      projectId: "99999999-9999-4999-8999-999999999999",
      reviewId: "review_tui_session",
      annotationId: "ann-tui-inline",
      type: "suggestion",
      filePath: "src/app.ts",
      lineStart: 2,
      lineEnd: 2,
      side: "new",
      text: "Inline TUI review note.",
      suggestedCode: "trace()",
      searchQuery: "trace",
    }]);
    expect(rendered).toContain("Review Session");
    expect(rendered).toContain("status: annotated");
    expect(rendered).toContain("review: review_tui_session");
    expect(rendered).toContain("revision: 4");
    expect(rendered).toContain("annotations: 3 blocking: 1 suggestions: 2");
  });
});
