import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProductArgs, run as runProduct } from "./product.ts";

function testIo() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runMainProductInit(fulcrumHome: string, json = false): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn([
    process.execPath,
    "run",
    "apps/cli/src/main.ts",
    "product",
    "init",
    ...(json ? ["--json"] : []),
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: fulcrumHome,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("fulcrum product CLI", () => {
  test("product parser preserves mixed positionals, flags, json, and passthrough", () => {
    const parsed = parseProductArgs([
      "task-1",
      "--status=done",
      "--json",
      "--project",
      "alpha",
      "task-2",
      "--",
      "--literal",
      "tail",
    ]);

    expect(parsed).toEqual({
      positionals: ["task-1", "task-2"],
      flags: {
        "--status": "done",
        "--json": true,
        "--project": "alpha",
      },
      passthrough: ["--literal", "tail"],
    });
  });

  test("product parser rejects unknown flags before swallowing positionals", () => {
    expect(() => parseProductArgs(["task-1", "--bogus", "task-2"])).toThrow(
      "unknown flag: --bogus",
    );
  });

  test("product init --json reports application-backed readiness shape", async () => {
    const io = testIo();
    const prevHome = process.env["FULCRUM_HOME"];
    process.env["FULCRUM_HOME"] = join(await mkdtemp(join(tmpdir(), "fulcrum-product-test-")), ".fulcrum");
    try {
      await runProduct(["init", "--json"], io.opts);
    } finally {
      if (prevHome === undefined) delete process.env["FULCRUM_HOME"];
      else process.env["FULCRUM_HOME"] = prevHome;
    }
    expect(JSON.parse(io.out[0]!)).toEqual(expect.objectContaining({
      ok: true,
      engine: "pglite",
      org: expect.objectContaining({ slug: "local", name: "Local", created: true }),
    }));
  });

  test("product init is idempotent and creates the PGlite data directory", async () => {
    const prevHome = process.env["FULCRUM_HOME"];
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-product-idempotent-"));
    const fulcrumHome = join(scratch, ".fulcrum");
    process.env["FULCRUM_HOME"] = fulcrumHome;

    try {
      const firstIo = testIo();
      const coldStartBeganAt = performance.now();
      await runProduct(["init", "--json"], firstIo.opts);
      const coldStartMs = performance.now() - coldStartBeganAt;
      const secondIo = testIo();
      await runProduct(["init", "--json"], secondIo.opts);

      const first = JSON.parse(firstIo.out[0]!);
      const second = JSON.parse(secondIo.out[0]!);
      expect(firstIo.err).toEqual([]);
      expect(secondIo.err).toEqual([]);
      expect(firstIo.exits).toEqual([]);
      expect(secondIo.exits).toEqual([]);
      expect(first.schemaApplied).toEqual(["bootstrapped"]);
      expect(second.schemaApplied).toEqual(["already-initialized"]);
      expect(first.org.created).toBe(true);
      expect(second.org.created).toBe(false);
      expect(await exists(join(fulcrumHome, "db", "main"))).toBe(true);
      expect(coldStartMs).toBeLessThan(5_000);
    } finally {
      if (prevHome === undefined) delete process.env["FULCRUM_HOME"];
      else process.env["FULCRUM_HOME"] = prevHome;
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("main product init --json keeps JSON on stdout and errors off stderr", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-product-main-"));
    const fulcrumHome = join(scratch, ".fulcrum");

    try {
      const first = await runMainProductInit(fulcrumHome, true);
      const second = await runMainProductInit(fulcrumHome, true);

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(first.stderr).toBe("");
      expect(second.stderr).toBe("");
      expect(JSON.parse(first.stdout)).toMatchObject({
        ok: true,
        engine: "pglite",
        org: { slug: "local", created: true },
      });
      expect(JSON.parse(second.stdout)).toMatchObject({
        ok: true,
        engine: "pglite",
        org: { slug: "local", created: false },
      });
      expect(await exists(join(fulcrumHome, "db", "main"))).toBe(true);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 15_000);

  test("product commands use configured public APIs after local init", async () => {
    const prevHome = process.env["FULCRUM_HOME"];
    process.env["FULCRUM_HOME"] = join(await mkdtemp(join(tmpdir(), "fulcrum-product-session-test-")), ".fulcrum");
    try {
      const initIo = testIo();
      await runProduct(["init", "--json"], initIo.opts);
      expect(initIo.exits).toEqual([]);

      const calls: Array<{ url: string; init: RequestInit }> = [];
      const env = {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "11111111-1111-4111-8111-111111111111",
        FULCRUM_USER_ID: "22222222-2222-4222-8222-222222222222",
      };
      const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/workflows/review/final-qa/report")) {
          return Response.json({ status: "ready", traceId: "trace-product" });
        }
        if (String(url).includes("/api/v1/tasks")) {
          return Response.json({ id: "task-1", title: "Plan task", status: "pending" });
        }
        return Response.json([]);
      }) as typeof fetch;

      const listIo = testIo();
      await runProduct(["projects", "list", "--json"], { ...listIo.opts, env, fetch: fetchFn });
      expect(listIo.exits).toEqual([]);
      expect(JSON.parse(listIo.out[0]!)).toEqual([]);

      const taskIo = testIo();
      await runProduct(["tasks", "create", "--title", "Plan task", "--project", "project-1", "--json"], {
        ...taskIo.opts,
        env,
        fetch: fetchFn,
      });
      expect(taskIo.exits).toEqual([]);
      expect(JSON.parse(taskIo.out[0]!)).toMatchObject({ id: "task-1", title: "Plan task" });

      const reportIo = testIo();
      await runProduct(["reports", "final-qa", "--project", "project-1", "--trace", "trace-product", "--json"], {
        ...reportIo.opts,
        env,
        fetch: fetchFn,
      });
      expect(reportIo.exits).toEqual([]);
      expect(JSON.parse(reportIo.out[0]!)).toEqual({ status: "ready", traceId: "trace-product" });

      expect(calls.map((call) => call.url)).toEqual([
        "http://127.0.0.1:3210/api/v1/projects?orgId=11111111-1111-4111-8111-111111111111",
        "http://127.0.0.1:3210/api/v1/tasks?orgId=11111111-1111-4111-8111-111111111111&userId=22222222-2222-4222-8222-222222222222",
        "http://127.0.0.1:3210/workflows/review/final-qa/report",
      ]);
    } finally {
      if (prevHome === undefined) delete process.env["FULCRUM_HOME"];
      else process.env["FULCRUM_HOME"] = prevHome;
    }
  });

  test("product commands require a configured public API without injected caller", async () => {
    const io = testIo();
    await runProduct(["projects", "list", "--json"], io.opts);

    expect(io.out).toEqual([]);
    expect(io.exits).toEqual([1]);
    expect(io.err.join("\n")).toContain("Product API caller is not configured");
  });

  test("product projects list --json uses caller fixture", async () => {
    const io = testIo();
    await runProduct(["projects", "list", "--json"], {
      ...io.opts,
      caller: { projects: { list: async () => [{ id: "p1", slug: "alpha", name: "Alpha" }] } },
    });
    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "p1", slug: "alpha", name: "Alpha" }]);
  });

  test("product tasks create/list/update/bulk/move route through caller", async () => {
    const reviewPath = join(await mkdtemp(join(tmpdir(), "fulcrum-product-qa-review-")), "review.md");
    await Bun.write(reviewPath, "### Verdict: REVISE\nTie the feedback run to success criteria.");
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      tasks: {
        create: async (input: Record<string, unknown>) => {
          calls.push({ method: "create", input });
          return { id: "t1", title: input["title"], status: "pending" };
        },
        list: async (input: Record<string, unknown>) => {
          calls.push({ method: "list", input });
          return [{ id: "t1", title: "Task", status: input["status"] }];
        },
        update: async (input: Record<string, unknown>) => {
          calls.push({ method: "update", input });
          return { id: input["id"], status: input["status"], sprintId: input["sprintId"] };
        },
        previewDependencyRun: async (input: Record<string, unknown>) => {
          calls.push({ method: "previewDependencyRun", input });
          return {
            requiresDisclosure: true,
            traceId: input["traceId"],
            targetTaskIds: input["targetTaskIds"],
            orderedTaskIds: input["targetTaskIds"],
            tasks: [],
            warnings: [],
          };
        },
        dispatchDependencyRun: async (input: Record<string, unknown>) => {
          calls.push({ method: "dispatchDependencyRun", input });
          return {
            runGroupId: input["traceId"],
            scheduledRuns: [{ id: "run-1", taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", agent: input["agent"], status: "queued" }],
            skippedTasks: [],
            warnings: [],
          };
        },
        dependencyRunLiveFeedback: async (input: Record<string, unknown>) => {
          calls.push({ method: "dependencyRunLiveFeedback", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            runGroupId: input["traceId"],
            executorStatus: { queuedTaskCount: 1, runningTaskCount: 0, succeededTaskCount: 0, failedTaskCount: 0, blockedTaskCount: 0, inReviewCount: 0, active: true },
            runs: [{ id: "run-1", taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "queued", queuePosition: 1, dependencyIds: [], latestEventSummary: null }],
            events: [],
            latestEvent: null,
          };
        },
        runDependencyRunWorkerTick: async (input: Record<string, unknown>) => {
          calls.push({ method: "runDependencyRunWorkerTick", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            runGroupId: input["traceId"],
            workerId: input["workerId"],
            processedRun: {
              id: "run-1",
              taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              traceId: input["traceId"],
              agent: "codex",
              status: "succeeded",
              output: "worker complete",
              jobId: "job-1",
            },
            skippedReason: null,
            feedback: {
              projectId: input["projectId"],
              traceId: input["traceId"],
              runGroupId: input["traceId"],
              executorStatus: { queuedTaskCount: 0, runningTaskCount: 0, succeededTaskCount: 1, failedTaskCount: 0, blockedTaskCount: 0, inReviewCount: 0, active: false },
              runs: [],
              events: [],
              latestEvent: null,
            },
          };
        },
        recordQaReview: async (input: Record<string, unknown>) => {
          calls.push({ method: "recordQaReview", input });
          return {
            taskId: input["taskId"],
            runId: input["runId"],
            traceId: input["traceId"],
            reviewType: input["reviewType"],
            reviewerAgent: input["reviewerAgent"],
            verdict: "REVISE",
            nextAction: "feedback_run_scheduled",
            successCriteria: [],
            feedbackRun: { id: "run-qa-fix", taskId: input["taskId"], agent: input["feedbackAgent"], status: "queued" },
            recoveryPlan: null,
            reviewFeed: { mode: "reviewer-agent", refreshable: true, fetchedAt: null, summary: null, items: [] },
          };
        },
        manualWorkbench: async (input: Record<string, unknown>) => {
          calls.push({ method: "manualWorkbench", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            viewMode: input["viewMode"],
            layout: "kanban",
            filtersApplied: 3,
            accessSpecifiers: [],
            columns: [],
            listRows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Build manual task workbench", traceId: input["traceId"] }],
            table: { visibleColumns: [], rows: [] },
            emptyState: { allTasksEmpty: false, visibleTasksEmpty: false, message: "" },
          };
        },
      },
    };
    for (const argv of [
      ["tasks", "create", "--title", "Fix bug", "--project", "alpha", "--json"],
      ["tasks", "list", "--status", "open", "--project", "alpha", "--json"],
      [
        "tasks",
        "workbench",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_workbench",
        "--view",
        "board",
        "--state-group",
        "started",
        "--labels",
        "agent,ux",
        "--cycle",
        "cycle-foundation",
        "--json",
      ],
      ["tasks", "update", "t1", "--status", "done", "--json"],
      ["tasks", "bulk", "t1,t2", "--status", "done", "--json"],
      ["tasks", "move", "t1", "--sprint", "s1", "--json"],
      [
        "tasks",
        "run-preview",
        "--task",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_preview",
        "--json",
      ],
      [
        "tasks",
        "run-preview",
        "--mode",
        "board",
        "--tasks",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "--trace",
        "trace_cli_board_preview",
        "--json",
      ],
      [
        "tasks",
        "run",
        "--task",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "--agent",
        "codex",
        "--model",
        "gpt-dependency",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_dispatch",
        "--prompt",
        "Ship dependency tree",
        "--json",
      ],
      [
        "tasks",
        "run-feed",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_dispatch",
        "--json",
      ],
      [
        "tasks",
        "run-worker",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_dispatch",
        "--worker",
        "worker-cli",
        "--cwd",
        "/repo",
        "--json",
      ],
      [
        "tasks",
        "qa-review",
        "--task",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "--run",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "--review-file",
        reviewPath,
        "--type",
        "code",
        "--reviewer-agent",
        "qa-reviewer",
        "--feedback-agent",
        "codex",
        "--feedback-model",
        "gpt-feedback",
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_cli_qa",
        "--json",
      ],
    ]) {
      const io = testIo();
      await runProduct(argv, { ...io.opts, caller });
      expect(io.exits).toEqual([]);
      expect(io.out.length).toBe(1);
    }

    expect(calls.map((call) => call.method)).toEqual([
      "create",
      "list",
      "manualWorkbench",
      "update",
      "update",
      "update",
      "update",
      "previewDependencyRun",
      "previewDependencyRun",
      "dispatchDependencyRun",
      "dependencyRunLiveFeedback",
      "runDependencyRunWorkerTick",
      "recordQaReview",
    ]);
    const previewCalls = calls.filter((call) => call.method === "previewDependencyRun");
    expect(previewCalls[0]?.input).toEqual({
      mode: "task",
      targetTaskIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_preview",
    });
    expect(calls.find((call) => call.method === "manualWorkbench")?.input).toEqual({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_workbench",
      viewMode: "board",
      filters: {
        stateGroups: ["started"],
        labels: ["agent", "ux"],
        cycleIds: ["cycle-foundation"],
      },
    });
    expect(previewCalls[1]?.input).toEqual({
      mode: "board",
      targetTaskIds: [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
      traceId: "trace_cli_board_preview",
    });
    expect(calls.find((call) => call.method === "recordQaReview")?.input).toEqual({
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_qa",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      reviewText: "### Verdict: REVISE\nTie the feedback run to success criteria.",
    });
    expect(calls.find((call) => call.method === "dispatchDependencyRun")?.input).toEqual({
      mode: "task",
      targetTaskIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_dispatch",
      agent: "codex",
      model: "gpt-dependency",
      prompt: "Ship dependency tree",
    });
    expect(calls.find((call) => call.method === "dependencyRunLiveFeedback")?.input).toEqual({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_dispatch",
    });
    expect(calls.find((call) => call.method === "runDependencyRunWorkerTick")?.input).toEqual({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_dispatch",
      workerId: "worker-cli",
      cwd: "/repo",
    });
  });

  test("product tasks run-feed --watch streams feedback events as JSON lines", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    let unsubscribed = 0;
    const caller = {
      tasks: {
        create: async () => ({}),
        list: async () => [],
        update: async () => ({}),
        dependencyRunLiveFeedbackStream: async (input: Record<string, unknown>) => {
          calls.push({ method: "dependencyRunLiveFeedbackStream", input });
          return {
            subscribe(observer: {
              next(value: unknown): void;
              complete(): void;
            }) {
              observer.next({
                projectId: input["projectId"],
                traceId: input["traceId"],
                runGroupId: input["traceId"],
                executorStatus: { queuedTaskCount: 1, runningTaskCount: 0, succeededTaskCount: 0, failedTaskCount: 0, blockedTaskCount: 0, inReviewCount: 0, active: true },
                runs: [{ id: "run-1", status: "queued" }],
                events: [],
                latestEvent: null,
              });
              observer.next({
                projectId: input["projectId"],
                traceId: input["traceId"],
                runGroupId: input["traceId"],
                executorStatus: { queuedTaskCount: 0, runningTaskCount: 0, succeededTaskCount: 1, failedTaskCount: 0, blockedTaskCount: 0, inReviewCount: 0, active: false },
                runs: [{ id: "run-1", status: "succeeded" }],
                events: [{ summary: "Agent run completed", output: "worker complete" }],
                latestEvent: { summary: "Agent run completed", output: "worker complete" },
              });
              observer.next({
                projectId: input["projectId"],
                traceId: input["traceId"],
                runGroupId: input["traceId"],
                executorStatus: { queuedTaskCount: 0, runningTaskCount: 0, succeededTaskCount: 1, failedTaskCount: 0, blockedTaskCount: 0, inReviewCount: 0, active: false },
                runs: [{ id: "run-1", status: "duplicate-after-inactive" }],
                events: [],
                latestEvent: null,
              });
              observer.complete();
              return { unsubscribe() { unsubscribed += 1; } };
            },
          };
        },
      },
    };
    const io = testIo();

    await runProduct([
      "tasks",
      "run-feed",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_stream",
      "--watch",
      "--json",
    ], { ...io.opts, caller });

    expect(io.exits).toEqual([]);
    expect(calls).toEqual([{
      method: "dependencyRunLiveFeedbackStream",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_stream",
      },
    }]);
    expect(io.out).toHaveLength(2);
    expect(JSON.parse(io.out[0]!)).toMatchObject({ traceId: "trace_cli_stream", executorStatus: { active: true } });
    expect(JSON.parse(io.out[1]!)).toMatchObject({ traceId: "trace_cli_stream", executorStatus: { active: false } });
    expect(io.out.join("\n")).not.toContain("duplicate-after-inactive");
    expect(unsubscribed).toBe(1);
  });

  test("product sprints/search/context use caller fixture", async () => {
    const caller = {
      sprints: {
        list: async () => [{ id: "s1", name: "Sprint 1", status: "planned" }],
        start: async ({ id }: { id: string }) => ({ id, status: "active" }),
        close: async ({ id }: { id: string }) => ({ id, status: "completed" }),
      },
      search: {
        query: async () => [{ source_kind: "doc", source_id: "d1", title: "kernel" }],
      },
      context: {
        assemble: async () => ({ taskId: "t1", body: "## Task\nWire CLI" }),
      },
    };
    const outputs: string[] = [];

    for (const argv of [
      ["sprints", "list", "--project", "p", "--json"],
      ["sprints", "activate", "s1", "--json"],
      ["sprints", "complete", "s1", "--json"],
      ["search", "kernel", "--kind", "doc", "--json"],
      ["context", "assemble", "--task", "t1", "--json"],
    ]) {
      const io = testIo();
      await runProduct(argv, { ...io.opts, caller });
      expect(io.exits).toEqual([]);
      expect(io.out.length).toBe(1);
      outputs.push(io.out[0] ?? "{}");
    }
  });

  test("product reports final-qa, uat-handoff, decision, and e2e-run route through reports caller with project and trace", async () => {
    const reviewDir = await mkdtemp(join(tmpdir(), "fulcrum-product-review-workbench-"));
    const diffPath = join(reviewDir, "diff-files.json");
    const annotationsPath = join(reviewDir, "annotations.json");
    await Bun.write(diffPath, JSON.stringify([{
      path: "src/app.ts",
      patch: "@@ -1 +1 @@\n+trace",
      additions: 1,
      deletions: 0,
    }]));
    await Bun.write(annotationsPath, JSON.stringify([{
      id: "ann-cli",
      type: "comment",
      filePath: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      side: "new",
      text: "Trace this review.",
      createdAt: 1,
    }]));
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      reports: {
        finalQa: async (input: Record<string, unknown>) => {
          calls.push({ method: "finalQa", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            status: "passed",
            readyForUserAcceptance: true,
            nextAction: "prompt_uat_code_review",
            summary: { taskCount: 1, docCount: 1 },
            checks: [],
            taskResults: [],
            markdown: "# Final QA Report\n\nStatus: passed",
          };
        },
        finalQaFeedbackGate: async (input: Record<string, unknown>) => {
          calls.push({ method: "finalQaFeedbackGate", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            loopAttempted: true,
            readyForUserAcceptance: true,
            nextAction: "prompt_uat_code_review",
            feedbackLoop: {
              stopReason: "automated_feedback_exhausted",
              exhausted: true,
            },
            finalQa: {
              status: "passed",
              nextAction: "prompt_uat_code_review",
            },
          };
        },
        uatCodeReviewHandoff: async (input: Record<string, unknown>) => {
          calls.push({ method: "uatCodeReviewHandoff", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            status: "ready",
            finalQaStatus: "passed",
            nextAction: "prompt_user_for_uat_code_review",
            reviewSessions: [{ id: "uat-trace-cli-uat", type: "uat", status: "pending_user_decision" }],
            decisionOptions: [{ id: "start_uat" }],
            promptMarkdown: "# UAT And Code Review Handoff",
          };
        },
        recordUatCodeReviewDecision: async (input: Record<string, unknown>) => {
          calls.push({ method: "recordUatCodeReviewDecision", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            decision: input["decision"],
            reviewType: input["reviewType"],
            status: "approved",
            nextAction: "real_data_e2e_generated",
            generatedE2eTests: [{
              filename: "uat-trace-cli-approval.spec.ts",
              runner: input["e2eRunner"],
              storePath: "org/project/run/uat-trace-cli-approval.spec.ts",
              bodyPath: "/tmp/fulcrum-artifacts/org/project/run/uat-trace-cli-approval.spec.ts",
              coverageCases: [{
                id: "task-1:1",
                criterion: "CLI exposes generated coverage cases.",
              }],
            }],
          };
        },
        applyConfiguredUatCodeReviewDecision: async (input: Record<string, unknown>) => {
          calls.push({ method: "applyConfiguredUatCodeReviewDecision", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
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
                filename: "uat-trace-cli-auto.spec.ts",
                coverageCases: [{
                  criterion: "CLI can trigger configured auto approval.",
                }],
              }],
            },
          };
        },
        runGeneratedE2eRegressionTests: async (input: Record<string, unknown>) => {
          calls.push({ method: "runGeneratedE2eRegressionTests", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            runner: input["runner"],
            status: input["planOnly"] ? "planned" : "passed",
            command: ["bun", "run", "web:e2e:generated", "--", "/tmp/fulcrum-artifacts/org/project/run/uat-trace-cli-approval.spec.ts"],
            cwd: "apps/web",
            testFiles: ["/tmp/fulcrum-artifacts/org/project/run/uat-trace-cli-approval.spec.ts"],
            artifactIds: ["artifact-generated-e2e"],
            stdout: "",
            stderr: "",
            exitCode: null,
            ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
            ciEnv: { FULCRUM_GENERATED_E2E_RUNNER: input["runner"] },
          };
        },
        reviewWorkbench: async (input: Record<string, unknown>) => {
          calls.push({ method: "reviewWorkbench", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            reviewId: input["reviewId"],
            summary: {
              fileCount: 1,
              visibleFileCount: 1,
              viewedFileCount: 0,
              annotationCount: 1,
              blockingAnnotationCount: 0,
              suggestionCount: 0,
              searchMatchCount: 1,
              hasLiveOutput: false,
            },
            fileTreeStats: {
              "src/app.ts": { annotationCount: 1, searchMatchCount: 1, viewed: false },
            },
          };
        },
        saveReviewWorkbenchSession: async (input: Record<string, unknown>) => {
          calls.push({ method: "saveReviewWorkbenchSession", input });
          return {
            projectId: input["projectId"],
            traceId: input["traceId"],
            reviewId: input["reviewId"],
            reviewType: input["reviewType"],
            title: input["title"],
            status: "saved",
            revision: 1,
            eventId: "event-cli-review-save",
            model: {
              summary: {
                fileCount: 1,
                visibleFileCount: 1,
                viewedFileCount: 0,
                annotationCount: 1,
                blockingAnnotationCount: 0,
                suggestionCount: 0,
                searchMatchCount: 1,
                hasLiveOutput: false,
              },
              fileTreeStats: {
                "src/app.ts": { annotationCount: 1, searchMatchCount: 1, viewed: false },
              },
            },
          };
        },
        loadReviewWorkbenchSession: async (input: Record<string, unknown>) => {
          calls.push({ method: "loadReviewWorkbenchSession", input });
          return {
            projectId: input["projectId"],
            traceId: "trace_cli_review_session",
            reviewId: input["reviewId"],
            reviewType: "code_review",
            title: "CLI persisted review",
            status: "loaded",
            revision: 2,
            eventId: "event-cli-review-load",
            model: {
              summary: {
                fileCount: 1,
                visibleFileCount: 1,
                viewedFileCount: 0,
                annotationCount: 1,
                blockingAnnotationCount: 0,
                suggestionCount: 0,
                searchMatchCount: 1,
                hasLiveOutput: false,
              },
            },
          };
        },
        appendReviewWorkbenchAnnotation: async (input: Record<string, unknown>) => {
          calls.push({ method: "appendReviewWorkbenchAnnotation", input });
          return {
            projectId: input["projectId"],
            traceId: "trace_cli_review_session",
            reviewId: input["reviewId"],
            reviewType: "code_review",
            title: "CLI persisted review",
            status: "annotated",
            revision: 3,
            eventId: "event-cli-review-annotation",
            model: {
              summary: {
                fileCount: 1,
                visibleFileCount: 1,
                viewedFileCount: 0,
                annotationCount: 2,
                blockingAnnotationCount: 0,
                suggestionCount: 1,
                searchMatchCount: 1,
                hasLiveOutput: false,
              },
            },
          };
        },
      },
    };

    const io = testIo();
    await runProduct([
      "reports",
      "final-qa",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_final_qa",
      "--json",
    ], { ...io.opts, caller });

    expect(io.exits).toEqual([]);
    expect(JSON.parse(io.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      status: "passed",
      nextAction: "prompt_uat_code_review",
    });
    const gateIo = testIo();
    await runProduct([
      "reports",
      "final-qa-gate",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_final_qa_gate",
      "--worker",
      "worker-cli",
      "--reviewer-agent",
      "qa-reviewer",
      "--feedback-agent",
      "codex",
      "--feedback-model",
      "gpt-5.4",
      "--max-iterations",
      "4",
      "--cwd",
      "/tmp/fulcrum-work",
      "--copy-to-worktree",
      "apps/cli/src/product.ts,services/planning-review/src/application/reports/report-contracts.ts",
      "--json",
    ], { ...gateIo.opts, caller });

    expect(gateIo.exits).toEqual([]);
    expect(JSON.parse(gateIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      loopAttempted: true,
      nextAction: "prompt_uat_code_review",
      feedbackLoop: {
        stopReason: "automated_feedback_exhausted",
      },
    });
    const uatIo = testIo();
    await runProduct([
      "reports",
      "uat-handoff",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_uat",
      "--json",
    ], { ...uatIo.opts, caller });

    expect(uatIo.exits).toEqual([]);
    expect(JSON.parse(uatIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      status: "ready",
      nextAction: "prompt_user_for_uat_code_review",
    });
    const decisionIo = testIo();
    await runProduct([
      "reports",
      "decision",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_approval",
      "--decision",
      "approve_without_manual_review",
      "--type",
      "uat",
      "--feedback",
      "Approved",
      "--runner",
      "playwright",
      "--json",
    ], { ...decisionIo.opts, caller });

    expect(decisionIo.exits).toEqual([]);
	    expect(JSON.parse(decisionIo.out[0]!)).toMatchObject({
	      projectId: "99999999-9999-4999-8999-999999999999",
	      status: "approved",
	      nextAction: "real_data_e2e_generated",
	      generatedE2eTests: [{
	        coverageCases: [{
	          criterion: "CLI exposes generated coverage cases.",
	        }],
	      }],
	    });
    const autoDecisionIo = testIo();
    await runProduct([
      "reports",
      "auto-decision",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_auto",
      "--tasks",
      "11111111-1111-4111-8111-111111111111",
      "--json",
    ], { ...autoDecisionIo.opts, caller });

    expect(autoDecisionIo.exits).toEqual([]);
    expect(JSON.parse(autoDecisionIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_auto",
      status: "applied",
      nextAction: "real_data_e2e_generated",
      decision: {
        status: "approved",
        generatedE2eTests: [{
          coverageCases: [{
            criterion: "CLI can trigger configured auto approval.",
          }],
        }],
      },
    });
    const e2eRunIo = testIo();
    await runProduct([
      "reports",
      "e2e-run",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_approval",
      "--runner",
      "playwright",
      "--plan-only",
      "--json",
    ], { ...e2eRunIo.opts, caller });

    expect(e2eRunIo.exits).toEqual([]);
    expect(JSON.parse(e2eRunIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      runner: "playwright",
      status: "planned",
      command: ["bun", "run", "web:e2e:generated", "--", "/tmp/fulcrum-artifacts/org/project/run/uat-trace-cli-approval.spec.ts"],
      cwd: "apps/web",
    });
    const reviewWorkbenchIo = testIo();
    await runProduct([
      "reports",
      "review-workbench",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_review",
      "--review",
      "review_cli_1",
      "--diff-file",
      diffPath,
      "--annotations-file",
      annotationsPath,
      "--search",
      "trace",
      "--selected-file",
      "src/app.ts",
      "--viewed-files",
      "src/other.ts",
      "--hide-viewed",
      "--json",
    ], { ...reviewWorkbenchIo.opts, caller });

    expect(reviewWorkbenchIo.exits).toEqual([]);
    expect(JSON.parse(reviewWorkbenchIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_review",
      reviewId: "review_cli_1",
      summary: { searchMatchCount: 1 },
    });
    const reviewSessionSaveIo = testIo();
    await runProduct([
      "reports",
      "review-session",
      "save",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_cli_review_session",
      "--review",
      "review_cli_session",
      "--type",
      "code_review",
      "--title",
      "CLI persisted review",
      "--diff-file",
      diffPath,
      "--annotations-file",
      annotationsPath,
      "--search",
      "trace",
      "--json",
    ], { ...reviewSessionSaveIo.opts, caller });

    expect(reviewSessionSaveIo.exits).toEqual([]);
    expect(JSON.parse(reviewSessionSaveIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_review_session",
      reviewId: "review_cli_session",
      status: "saved",
      revision: 1,
    });
    const reviewSessionLoadIo = testIo();
    await runProduct([
      "reports",
      "review-session",
      "load",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--review",
      "review_cli_session",
      "--search",
      "trace",
      "--json",
    ], { ...reviewSessionLoadIo.opts, caller });

    expect(reviewSessionLoadIo.exits).toEqual([]);
    expect(JSON.parse(reviewSessionLoadIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_review_session",
      reviewId: "review_cli_session",
      status: "loaded",
      revision: 2,
    });
    const reviewSessionAnnotateIo = testIo();
    await runProduct([
      "reports",
      "review-session",
      "annotate",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--review",
      "review_cli_session",
      "--annotation",
      "ann-cli-inline",
      "--type",
      "suggestion",
      "--file",
      "src/app.ts",
      "--line-start",
      "1",
      "--line-end",
      "1",
      "--side",
      "new",
      "--text",
      "Inline CLI review note.",
      "--suggested-code",
      "trace()",
      "--search",
      "trace",
      "--json",
    ], { ...reviewSessionAnnotateIo.opts, caller });

    expect(reviewSessionAnnotateIo.exits).toEqual([]);
    expect(JSON.parse(reviewSessionAnnotateIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_cli_review_session",
      reviewId: "review_cli_session",
      status: "annotated",
      revision: 3,
      model: {
        summary: {
          annotationCount: 2,
          suggestionCount: 1,
        },
      },
    });
    expect(calls).toEqual([{
      method: "finalQa",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_final_qa",
      },
    }, {
      method: "finalQaFeedbackGate",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_final_qa_gate",
        workerId: "worker-cli",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        feedbackModel: "gpt-5.4",
        maxIterations: 4,
        cwd: "/tmp/fulcrum-work",
        copyToWorktree: [
          "apps/cli/src/product.ts",
          "services/planning-review/src/application/reports/report-contracts.ts",
        ],
      },
    }, {
      method: "uatCodeReviewHandoff",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_uat",
      },
    }, {
      method: "recordUatCodeReviewDecision",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_approval",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedbackText: "Approved",
        e2eRunner: "playwright",
      },
    }, {
      method: "applyConfiguredUatCodeReviewDecision",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_auto",
        taskIds: ["11111111-1111-4111-8111-111111111111"],
      },
    }, {
      method: "runGeneratedE2eRegressionTests",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_approval",
        runner: "playwright",
        planOnly: true,
      },
    }, {
      method: "reviewWorkbench",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_review",
        reviewId: "review_cli_1",
        files: [{
          path: "src/app.ts",
          patch: "@@ -1 +1 @@\n+trace",
          additions: 1,
          deletions: 0,
        }],
        annotations: [{
          id: "ann-cli",
          type: "comment",
          filePath: "src/app.ts",
          lineStart: 1,
          lineEnd: 1,
          side: "new",
          text: "Trace this review.",
          createdAt: 1,
        }],
        searchQuery: "trace",
        selectedFilePath: "src/app.ts",
        viewedFilePaths: ["src/other.ts"],
        hideViewedFiles: true,
      },
    }, {
      method: "saveReviewWorkbenchSession",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_cli_review_session",
        reviewId: "review_cli_session",
        reviewType: "code_review",
        title: "CLI persisted review",
        files: [{
          path: "src/app.ts",
          patch: "@@ -1 +1 @@\n+trace",
          additions: 1,
          deletions: 0,
        }],
        annotations: [{
          id: "ann-cli",
          type: "comment",
          filePath: "src/app.ts",
          lineStart: 1,
          lineEnd: 1,
          side: "new",
          text: "Trace this review.",
          createdAt: 1,
        }],
        searchQuery: "trace",
      },
    }, {
      method: "loadReviewWorkbenchSession",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        reviewId: "review_cli_session",
        searchQuery: "trace",
      },
    }, {
      method: "appendReviewWorkbenchAnnotation",
      input: {
        projectId: "99999999-9999-4999-8999-999999999999",
        reviewId: "review_cli_session",
        annotationId: "ann-cli-inline",
        type: "suggestion",
        filePath: "src/app.ts",
        lineStart: 1,
        lineEnd: 1,
        side: "new",
        text: "Inline CLI review note.",
        suggestedCode: "trace()",
        searchQuery: "trace",
      },
    }]);
  });

  test("product workflows acceptance-cycle run delegates full-cycle payload to caller", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-product-workflow-cycle-"));
    const inputPath = join(dir, "acceptance-cycle.json");
    const input = {
      workspace: { id: "workspace-cli-cycle", slug: "cli-cycle", name: "CLI Cycle" },
      project: {
        id: "project-cli-cycle",
        slug: "cli-cycle",
        name: "CLI Cycle",
        traceId: "trace_cli_cycle",
      },
      freeform: {
        documentId: "doc-cli-cycle",
        title: "CLI freeform brief",
        bodyMd: "Start with a rough brief, plan, run, review, approve, and generate E2E.",
        userPrompt: "Turn this into a technical plan and run it through acceptance.",
      },
      guidedPlanning: {
        acpSessionId: "acp-cli-cycle",
        agentName: "codex",
        cwd: "/repo",
        modeId: "planning",
        modelId: "gpt-5.4",
        permissionMode: "review_each_tool",
      },
      approvedPlan: {
        planId: "plan-cli-cycle",
        reviewId: "review-cli-cycle",
        markdown: "# Plan\n\n## Tasks\n- [context] Preserve context",
      },
      execution: {
        agent: "codex",
        model: "gpt-5.4",
        prompt: "Run dependency tree",
        lifecycleSummary: "All tasks succeeded.",
        qaReviewText: "### Verdict: APPROVE\nAll criteria passed.",
        qaReviewType: "code",
      },
      uat: {
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      },
    };
    await Bun.write(inputPath, JSON.stringify(input));
    const calls: unknown[] = [];
    const caller = {
      workflows: {
        runAcceptanceCycle: async (payload: Record<string, unknown>) => {
          calls.push(payload);
          return {
            traceId: payload["project"] && (payload["project"] as { traceId?: string }).traceId,
            generatedE2e: { status: "planned", testFiles: ["tests/e2e/generated/cli-cycle.test.ts"] },
          };
        },
      },
    };
    const io = testIo();

    await runProduct([
      "workflows",
      "acceptance-cycle",
      "run",
      "--file",
      inputPath,
      "--json",
    ], { ...io.opts, caller });

    expect(io.exits).toEqual([]);
    expect(calls).toEqual([input]);
    expect(JSON.parse(io.out[0]!)).toEqual({
      traceId: "trace_cli_cycle",
      generatedE2e: {
        status: "planned",
        testFiles: ["tests/e2e/generated/cli-cycle.test.ts"],
      },
    });
  });

  test("product planning preview/materialize route approved plans through planning caller", async () => {
    const planPath = join(await mkdtemp(join(tmpdir(), "fulcrum-product-plan-")), "approved-plan.md");
    await Bun.write(planPath, `# Approved Plan

## Tasks
- [T1] Build planning route
  Depends on: none
  Success: CLI keeps trace ids.
`);
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      planning: {
        previewApprovedPlanBreakdown: async (input: unknown) => {
          calls.push({ method: "preview", input });
          return { title: "Approved Plan", docs: [], taskDrafts: [{ clientKey: "T1" }], warnings: [] };
        },
        materializeApprovedPlanBreakdown: async (input: unknown) => {
          calls.push({ method: "materialize", input });
          return {
            breakdown: { title: "Approved Plan", docs: [], taskDrafts: [{ clientKey: "T1" }], warnings: [] },
            materialization: { docs: [{ clientKey: "plan-doc", id: "doc_1" }], tasks: [{ clientKey: "T1", id: "task_1" }] },
          };
        },
      },
    };
    const outputs: string[] = [];

    for (const argv of [
      [
        "planning",
        "preview",
        "--plan",
        "plan_1",
        "--file",
        planPath,
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_1",
        "--review",
        "review_1",
        "--cycle",
        "cycle_1",
        "--module",
        "module_1",
        "--source-docs",
        "doc_1,doc_2",
        "--json",
      ],
      [
        "planning",
        "materialize",
        "--plan",
        "plan_1",
        "--file",
        planPath,
        "--project",
        "99999999-9999-4999-8999-999999999999",
        "--trace",
        "trace_1",
        "--json",
      ],
    ]) {
      const io = testIo();
      await runProduct(argv, { ...io.opts, caller });
      expect(io.exits).toEqual([]);
      expect(io.out.length).toBe(1);
      outputs.push(io.out[0] ?? "{}");
    }

    expect(calls).toEqual([
      {
        method: "preview",
        input: {
          planId: "plan_1",
          approvedPlanMarkdown: `# Approved Plan

## Tasks
- [T1] Build planning route
  Depends on: none
  Success: CLI keeps trace ids.
`,
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_1",
          reviewId: "review_1",
          cycleId: "cycle_1",
          moduleId: "module_1",
          sourceDocRefs: [{ kind: "doc", id: "doc_1" }, { kind: "doc", id: "doc_2" }],
        },
      },
      {
        method: "materialize",
        input: {
          planId: "plan_1",
          approvedPlanMarkdown: `# Approved Plan

## Tasks
- [T1] Build planning route
  Depends on: none
  Success: CLI keeps trace ids.
`,
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_1",
        },
      },
    ]);
    expect(JSON.parse(outputs[1] ?? "{}")).toMatchObject({
      breakdown: { title: "Approved Plan" },
      materialization: { tasks: [{ id: "task_1" }] },
    });
  });

  test("product planning freeform-prompt routes freeform docs through planning caller", async () => {
    const calls: unknown[] = [];
    const caller = {
      planning: {
        previewApprovedPlanBreakdown: async () => ({}),
        materializeApprovedPlanBreakdown: async () => ({}),
        buildFreeformDocsPlanningPrompt: async (input: unknown) => {
          calls.push(input);
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
          calls.push(input);
          return {
            status: "ready_for_planning",
            eventId: "event-cli-freeform-start",
            document: {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              title: "CLI freeform brief",
              bodyMd: "Prototype first from CLI.",
            },
            context: {
              traceId: "trace_freeform_start_cli",
              sourceRefs: [{ kind: "doc", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
              selectedDocs: [],
              contextMarkdown: "## Freeform Document: CLI freeform brief",
            },
            prompt: "ACP start prompt with submit_plan",
          };
        },
        startGuidedAcpPlanningSession: async (input: unknown) => {
          calls.push(input);
          return {
            status: "ready_for_acp_prompt",
            eventId: "event-cli-guided-acp",
            session: {
              acpSessionId: "acp-guided-cli",
              agentName: "codex",
              cwd: "/repo",
              promptTemplateId: "prototype-first",
              traceId: "trace_guided_acp_cli",
              modeId: "planning",
              modelId: "gpt-5.5",
              permissionMode: "review_each_tool",
              availableModes: [{ id: "planning", name: "Planning" }],
              availableModels: [{ modelId: "gpt-5.5", name: "gpt-5.5" }],
            },
            permissionOptions: [{ optionId: "allow_once", kind: "allow", name: "Allow once" }],
            traffic: { entries: [{ method: "session/new" }, { method: "session/prompt" }] },
            context: {
              traceId: "trace_guided_acp_cli",
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              selectedDocs: [],
              contextMarkdown: "## Freeform Document: Brief",
            },
            prompt: "ACP guided session with submit_plan",
          };
        },
        restartPlanningCycleFromUpdates: async (input: unknown) => {
          calls.push(input);
          return {
            status: "ready_for_replanning",
            trigger: "manual_doc_edit",
            eventId: "event-cli-continuous-update",
            traceId: "trace_continuous_cli",
            acpSessionId: "acp-session-cli",
            modeId: "planning",
            modelId: "gpt-5.5",
            targetTaskIds: ["task-alpha", "task-beta"],
            changedDocs: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Updated CLI brief" }],
            context: {
              traceId: "trace_continuous_cli",
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              selectedDocs: [],
              contextMarkdown: "## Freeform Document: Updated CLI brief",
            },
            prompt: "Continue the Fulcrum workflow cycle\n\nsubmit_plan",
          };
        },
        generateTechnicalPlanningCycle: async (input: unknown) => {
          calls.push(input);
          return {
            status: "ready_for_plan_review",
            eventId: "event-cli-technical-planning",
            context: {
              traceId: "trace_technical_cli",
              sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
              selectedDocs: [],
              contextMarkdown: "## Freeform Document: Brief",
            },
            prompt: "Generate a technical plan with submit_plan",
            reviewPrompt: "Review this generated technical plan",
            plan: {
              planId: "technical-plan-cli",
              title: "Plan from CLI context",
              traceId: "trace_technical_cli",
              source: "freeform_docs",
              markdown: "# Plan from CLI context",
              prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
              boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
              sourceDocRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
            },
            breakdown: {
              title: "Plan from CLI context",
              docs: [],
              artifacts: [],
              successCriteria: [],
              taskDrafts: [{ clientKey: "T1", input: { title: "Generate plan" }, blockedByClientKeys: [] }],
              dependencyUpdates: [],
              warnings: [],
            },
          };
        },
      },
    };
    const io = testIo();

    await runProduct([
      "planning",
      "freeform-prompt",
      "--prompt",
      "Plan from freeform docs",
      "--source-docs",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_freeform",
      "--max-doc-chars",
      "2400",
      "--json",
    ], { ...io.opts, caller });

    expect(io.exits).toEqual([]);
    const startIo = testIo();
    await runProduct([
      "planning",
      "freeform-start",
      "--title",
      "CLI freeform brief",
      "--body",
      "Prototype first from CLI.",
      "--prompt",
      "Plan from CLI intake",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_freeform_start_cli",
      "--acp-session",
      "acp-session-cli",
      "--mode",
      "planning",
      "--model",
      "gpt-5.4",
      "--max-doc-chars",
      "2400",
      "--json",
    ], { ...startIo.opts, caller });

    expect(startIo.exits).toEqual([]);
    const guidedIo = testIo();
    await runProduct([
      "planning",
      "guided-acp-start",
      "--acp-session",
      "acp-guided-cli",
      "--agent",
      "codex",
      "--cwd",
      "/repo",
      "--prompt",
      "Plan with guided ACP",
      "--template",
      "prototype-first",
      "--source-docs",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_guided_acp_cli",
      "--mode",
      "planning",
      "--model",
      "gpt-5.5",
      "--permission",
      "review_each_tool",
      "--max-doc-chars",
      "2400",
      "--json",
    ], { ...guidedIo.opts, caller });

    expect(guidedIo.exits).toEqual([]);
    const continuousIo = testIo();
    await runProduct([
      "planning",
      "continuous-update",
      "--trigger",
      "manual_doc_edit",
      "--prompt",
      "Replan from CLI doc edits",
      "--doc",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "--title",
      "Updated CLI brief",
      "--body",
      "Updated context from CLI.",
      "--source-docs",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "--tasks",
      "task-alpha,task-beta",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_continuous_cli",
      "--acp-session",
      "acp-session-cli",
      "--mode",
      "planning",
      "--model",
      "gpt-5.5",
      "--max-doc-chars",
      "2400",
      "--json",
    ], { ...continuousIo.opts, caller });

    expect(continuousIo.exits).toEqual([]);
    const technicalIo = testIo();
    await runProduct([
      "planning",
      "generate",
      "--source",
      "freeform_docs",
      "--prompt",
      "Plan from CLI context",
      "--source-docs",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "--project",
      "99999999-9999-4999-8999-999999999999",
      "--trace",
      "trace_technical_cli",
      "--plan",
      "technical-plan-cli",
      "--review",
      "technical-review-cli",
      "--prototype-paths",
      "apps/web/src/routes/planning/workbench-prototype.tsx",
      "--boilerplate-paths",
      "services/planning-review/src/application/technical-planning-cycle.ts",
      "--criteria",
      "Prototype and boilerplate artifacts are visible before approval.",
      "--max-doc-chars",
      "2400",
      "--json",
    ], { ...technicalIo.opts, caller });

    expect(technicalIo.exits).toEqual([]);
    expect(calls).toEqual([{
      userPrompt: "Plan from freeform docs",
      selectedDocIds: [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_freeform",
      maxDocChars: 2400,
    }, {
      title: "CLI freeform brief",
      bodyMd: "Prototype first from CLI.",
      userPrompt: "Plan from CLI intake",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_freeform_start_cli",
      acpSessionId: "acp-session-cli",
      modeId: "planning",
      modelId: "gpt-5.4",
      maxDocChars: 2400,
    }, {
      acpSessionId: "acp-guided-cli",
      agentName: "codex",
      cwd: "/repo",
      userPrompt: "Plan with guided ACP",
      promptTemplateId: "prototype-first",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_guided_acp_cli",
      modeId: "planning",
      modelId: "gpt-5.5",
      permissionMode: "review_each_tool",
      maxDocChars: 2400,
    }, {
      trigger: "manual_doc_edit",
      userPrompt: "Replan from CLI doc edits",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      targetTaskIds: ["task-alpha", "task-beta"],
      changedDocs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Updated CLI brief",
        bodyMd: "Updated context from CLI.",
      }],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_continuous_cli",
      acpSessionId: "acp-session-cli",
      modeId: "planning",
      modelId: "gpt-5.5",
      maxDocChars: 2400,
    }, {
      source: "freeform_docs",
      userPrompt: "Plan from CLI context",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_technical_cli",
      maxDocChars: 2400,
      planId: "technical-plan-cli",
      reviewId: "technical-review-cli",
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
      successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
    }]);
    expect(JSON.parse(io.out[0] ?? "{}")).toMatchObject({
      prompt: "ACP prompt with submit_plan",
      context: { sourceRefs: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] },
    });
    expect(JSON.parse(startIo.out[0] ?? "{}")).toMatchObject({
      status: "ready_for_planning",
      document: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      prompt: "ACP start prompt with submit_plan",
    });
    expect(JSON.parse(guidedIo.out[0] ?? "{}")).toMatchObject({
      status: "ready_for_acp_prompt",
      session: { acpSessionId: "acp-guided-cli", agentName: "codex", modeId: "planning" },
      traffic: { entries: [{ method: "session/new" }, { method: "session/prompt" }] },
    });
    expect(JSON.parse(continuousIo.out[0] ?? "{}")).toMatchObject({
      status: "ready_for_replanning",
      traceId: "trace_continuous_cli",
      targetTaskIds: ["task-alpha", "task-beta"],
      prompt: "Continue the Fulcrum workflow cycle\n\nsubmit_plan",
    });
    expect(JSON.parse(technicalIo.out[0] ?? "{}")).toMatchObject({
      status: "ready_for_plan_review",
      plan: { planId: "technical-plan-cli", traceId: "trace_technical_cli" },
      reviewPrompt: "Review this generated technical plan",
    });
  });

  test("product review preview/session save/load/annotate route through reports caller", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      reports: {
        reviewWorkbench: async (input: Record<string, unknown>) => {
          calls.push({ method: "reviewWorkbench", input });
          return { projectId: input["projectId"], traceId: input["traceId"], summary: { fileCount: 0 } };
        },
        saveReviewWorkbenchSession: async (input: Record<string, unknown>) => {
          calls.push({ method: "saveReviewWorkbenchSession", input });
          return { projectId: input["projectId"], traceId: input["traceId"], status: "saved", revision: input["revision"] };
        },
        loadReviewWorkbenchSession: async (input: Record<string, unknown>) => {
          calls.push({ method: "loadReviewWorkbenchSession", input });
          return { projectId: input["projectId"], traceId: input["traceId"], status: "loaded", revision: 1 };
        },
        appendReviewWorkbenchAnnotation: async (input: Record<string, unknown>) => {
          calls.push({ method: "appendReviewWorkbenchAnnotation", input });
          return { projectId: input["projectId"], traceId: input["traceId"], status: "annotated" };
        },
      },
    };

    const previewIo = testIo();
    await runProduct([
      "review", "preview",
      "--project", "99999999-9999-4999-8999-999999999999",
      "--trace", "trace_review_preview",
      "--json",
    ], { ...previewIo.opts, caller });
    expect(previewIo.exits).toEqual([]);
    expect(JSON.parse(previewIo.out[0]!)).toMatchObject({
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_review_preview",
    });

    const saveIo = testIo();
    await runProduct([
      "review", "session", "save",
      "--project", "99999999-9999-4999-8999-999999999999",
      "--trace", "trace_review_save",
      "--revision", "3",
      "--summary", "Looks good overall",
      "--json",
    ], { ...saveIo.opts, caller });
    expect(saveIo.exits).toEqual([]);
    expect(JSON.parse(saveIo.out[0]!)).toMatchObject({ status: "saved", revision: 3 });

    const loadIo = testIo();
    await runProduct([
      "review", "session", "load",
      "--project", "99999999-9999-4999-8999-999999999999",
      "--trace", "trace_review_load",
      "--json",
    ], { ...loadIo.opts, caller });
    expect(loadIo.exits).toEqual([]);
    expect(JSON.parse(loadIo.out[0]!)).toMatchObject({ status: "loaded", revision: 1 });

    const annotateIo = testIo();
    await runProduct([
      "review", "session", "annotate",
      "--project", "99999999-9999-4999-8999-999999999999",
      "--trace", "trace_review_annotate",
      "--file", "src/main.ts",
      "--line", "42",
      "--body", "Consider extracting this into a helper.",
      "--severity", "warning",
      "--json",
    ], { ...annotateIo.opts, caller });
    expect(annotateIo.exits).toEqual([]);
    expect(JSON.parse(annotateIo.out[0]!)).toMatchObject({ status: "annotated" });

    expect(calls).toEqual([
      {
        method: "reviewWorkbench",
        input: {
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_review_preview",
          files: [],
          annotations: [],
        },
      },
      {
        method: "saveReviewWorkbenchSession",
        input: {
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_review_save",
          revision: 3,
          summary: "Looks good overall",
          files: [],
          annotations: [],
        },
      },
      {
        method: "loadReviewWorkbenchSession",
        input: {
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_review_load",
        },
      },
      {
        method: "appendReviewWorkbenchAnnotation",
        input: {
          projectId: "99999999-9999-4999-8999-999999999999",
          traceId: "trace_review_annotate",
          filePath: "src/main.ts",
          lineStart: 42,
          lineEnd: 42,
          text: "Consider extracting this into a helper.",
          severity: "warning",
        },
      },
    ]);
  });

  test("product review session annotate rejects invalid severity", async () => {
    const caller = {
      reports: {
        appendReviewWorkbenchAnnotation: async () => ({}),
      },
    };
    const io = testIo();
    await runProduct([
      "review", "session", "annotate",
      "--project", "p1",
      "--trace", "t1",
      "--file", "src/main.ts",
      "--line", "1",
      "--body", "note",
      "--severity", "critical",
      "--json",
    ], { ...io.opts, caller });
    expect(io.exits).toEqual([1]);
    expect(io.err[0]).toContain("--severity must be info, warning, or error");
  });

  test("invalid product arguments exit 2 with validation error", async () => {
    const io = testIo();
    await runProduct(["tasks", "create", "--project", "alpha"], {
      ...io.opts,
      caller: { tasks: { create: async () => ({}), list: async () => [], update: async () => ({}) } },
    });
    expect(io.exits).toEqual([2]);
    expect(io.err[0]).toContain("missing required flag --title");
  });
});
