import { readFile } from "node:fs/promises";

import { initializeLocalProductReadiness } from "@platform-core/interface/product-readiness.ts";
import { createMemoryApiCallerFromEnv } from "@knowledge-workspace/interface/http/memory-api-client.ts";
import { createSearchApiCallerFromEnv } from "@knowledge-workspace/interface/http/search-api-client.ts";
import { createProjectApiCallerFromEnv } from "@work-management/interface/http/project-api-client.ts";
import { createSprintApiCallerFromEnv } from "@work-management/interface/http/sprint-api-client.ts";
import { createTaskApiCallerFromEnv } from "@work-management/interface/http/task-api-client.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

type ProductCaller = {
  projects?: { list(input?: Record<string, unknown>): Promise<unknown[]> };
  tasks?: {
    create(input: Record<string, unknown>): Promise<unknown>;
    list(input?: Record<string, unknown>): Promise<unknown[] | { data?: unknown[] }>;
    update(input: Record<string, unknown>): Promise<unknown>;
    manualWorkbench?(input: Record<string, unknown>): Promise<unknown>;
    previewDependencyRun?(input: Record<string, unknown>): Promise<unknown>;
    dispatchDependencyRun?(input: Record<string, unknown>): Promise<unknown>;
    dependencyRunLiveFeedback?(input: Record<string, unknown>): Promise<unknown>;
    dependencyRunLiveFeedbackStream?(input: Record<string, unknown>): Promise<SubscriptionLike> | SubscriptionLike;
    runDependencyRunWorkerTick?(input: Record<string, unknown>): Promise<unknown>;
    recordQaReview?(input: Record<string, unknown>): Promise<unknown>;
  };
  sprints?: {
    list(input?: Record<string, unknown>): Promise<unknown[]>;
    start?(input: { id: string }): Promise<unknown>;
    close?(input: Record<string, unknown>): Promise<unknown>;
  };
  search?: { query(input: Record<string, unknown>): Promise<unknown[]> };
  context?: { assemble?(input: Record<string, unknown>): Promise<unknown> };
  reports?: {
    finalQa?(input: Record<string, unknown>): Promise<unknown>;
    finalQaFeedbackGate?(input: Record<string, unknown>): Promise<unknown>;
    uatCodeReviewHandoff?(input: Record<string, unknown>): Promise<unknown>;
    recordUatCodeReviewDecision?(input: Record<string, unknown>): Promise<unknown>;
    applyConfiguredUatCodeReviewDecision?(input: Record<string, unknown>): Promise<unknown>;
    runGeneratedE2eRegressionTests?(input: Record<string, unknown>): Promise<unknown>;
    reviewWorkbench?(input: Record<string, unknown>): Promise<unknown>;
    saveReviewWorkbenchSession?(input: Record<string, unknown>): Promise<unknown>;
    loadReviewWorkbenchSession?(input: Record<string, unknown>): Promise<unknown>;
    appendReviewWorkbenchAnnotation?(input: Record<string, unknown>): Promise<unknown>;
  };
  planning?: {
    previewApprovedPlanBreakdown(input: Record<string, unknown>): Promise<unknown>;
    materializeApprovedPlanBreakdown(input: Record<string, unknown>): Promise<unknown>;
    buildFreeformDocsPlanningPrompt?(input: Record<string, unknown>): Promise<unknown>;
    startFreeformWorkFromDocs?(input: Record<string, unknown>): Promise<unknown>;
    startGuidedAcpPlanningSession?(input: Record<string, unknown>): Promise<unknown>;
    restartPlanningCycleFromUpdates?(input: Record<string, unknown>): Promise<unknown>;
    generateTechnicalPlanningCycle?(input: Record<string, unknown>): Promise<unknown>;
  };
  workflows?: {
    runAcceptanceCycle?(input: Record<string, unknown>): Promise<unknown>;
  };
};

type SubscriptionLike = {
  subscribe(observer: {
    next(value: unknown): void;
    error?(error: unknown): void;
    complete?(): void;
  }): { unsubscribe?(): void };
};

export interface ProductRunOptions {
  caller?: ProductCaller;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum product - local product commands

Usage:
  fulcrum product init [--json]
  fulcrum product projects list [--json] [--limit <N>]
  fulcrum product tasks create --title <T> --project <P> [--json]
  fulcrum product tasks list [--status <S>] [--assignee <A>] [--project <P>] [--json]
  fulcrum product tasks workbench [--project <P>] [--trace <T>] [--view <board|list|table>] [--status <S>] [--state-group <G>] [--labels <L1,L2>] [--assignee <A>] [--cycle <C>] [--module <M>] [--task-type <T>] [--priority <N>] [--search <text>] [--json]
  fulcrum product tasks update <id> --status <S> [--json]
  fulcrum product tasks bulk <id,id,...> --status <S> [--json]
  fulcrum product tasks move <id> --sprint <S> [--json]
  fulcrum product tasks run-preview --task <id> [--project <P>] [--trace <T>] [--json]
  fulcrum product tasks run-preview --mode board --tasks <id,id,...> [--project <P>] [--trace <T>] [--json]
  fulcrum product tasks run --task <id> --agent <A> [--model <M>] [--project <P>] [--trace <T>] [--prompt <text>] [--json]
  fulcrum product tasks run --mode board --tasks <id,id,...> --agent <A> [--model <M>] [--project <P>] [--trace <T>] [--prompt <text>] [--json]
  fulcrum product tasks run-feed --trace <T> [--project <P>] [--run <R>] [--task <id>] [--watch] [--json]
  fulcrum product tasks run-worker --trace <T> [--project <P>] [--worker <id>] [--cwd <path>] [--json]
  fulcrum product tasks qa-review --task <id> --review-file <path> --type <code|plan|spec> [--run <id>] [--reviewer-agent <A>] [--feedback-agent <A>] [--feedback-model <M>] [--project <P>] [--trace <T>] [--json]
  fulcrum product sprints list --project <P> [--json]
  fulcrum product sprints activate <id> [--json]
  fulcrum product sprints complete <id> [--json]
  fulcrum product search <query> [--org-slug <slug>] [--kind <kind>] [--limit <N>] [--json]
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
  fulcrum product reports final-qa --project <id> [--trace <id>] [--json]
  fulcrum product reports final-qa-gate --project <id> [--trace <id>] [--worker <id>] [--reviewer-agent <A>] [--feedback-agent <A>] [--feedback-model <M>] [--max-iterations <N>] [--cwd <path>] [--copy-to-worktree <path,path,...>] [--json]
  fulcrum product reports uat-handoff --project <id> [--trace <id>] [--json]
  fulcrum product reports decision --project <id> --decision <start_uat|start_code_review|request_changes|approve_without_manual_review> --type <uat|code_review> [--trace <id>] [--feedback <text>] [--runner <bun|playwright>] [--json]
  fulcrum product reports auto-decision --project <id> [--trace <id>] [--tasks <id,id,...>] [--json]
  fulcrum product reports e2e-run --project <id> [--trace <id>] [--runner <bun|playwright>] [--plan-only] [--json]
  fulcrum product reports review-workbench --diff-file <path> [--annotations-file <path>] [--project <id>] [--trace <id>] [--review <id>] [--search <query>] [--selected-file <path>] [--viewed-files <path,path,...>] [--hide-viewed] [--json]
  fulcrum product reports review-session save --project <id> --diff-file <path> [--annotations-file <path>] [--trace <id>] [--review <id>] [--type <plan|uat|code_review>] [--title <text>] [--search <query>] [--json]
  fulcrum product reports review-session load --project <id> [--review <id>|--trace <id>] [--search <query>] [--selected-file <path>] [--viewed-files <path,path,...>] [--hide-viewed] [--json]
  fulcrum product reports review-session annotate --project <id> --file <path> --line-start <N> --line-end <N> [--review <id>|--trace <id>] [--annotation <id>] [--type <comment|suggestion|concern>] [--scope <line|file>] [--side <old|new>] [--text <text>] [--suggested-code <code>] [--original-code <code>] [--severity <important|nit|pre_existing>] [--decorations <blocking,non-blocking,if-minor>] [--search <query>] [--json]
  fulcrum product planning freeform-start --title <text> --body <markdown> --prompt <text> [--project <id>] [--trace <id>] [--acp-session <id>] [--mode <id>] [--model <id>] [--json]
  fulcrum product planning guided-acp-start --agent <A> --cwd <path> --prompt <text> [--template <id>] [--source-docs <ids>] [--project <id>] [--trace <id>] [--acp-session <id>] [--mode <id>] [--model <id>] [--permission <review_each_tool|allow_workspace|read_only>] [--json]
  fulcrum product planning continuous-update --trigger <manual_doc_edit|acp_session_update> --prompt <text> [--doc <id>] [--title <text>] [--body <markdown>] [--source-docs <ids>] [--tasks <ids>] [--project <id>] [--trace <id>] [--acp-session <id>] [--mode <id>] [--model <id>] [--json]
  fulcrum product planning generate --source <freeform_docs|guided_acp|continuous_update> --prompt <text> [--source-docs <ids>] [--project <id>] [--trace <id>] [--plan <id>] [--review <id>] [--prototype-paths <paths>] [--boilerplate-paths <paths>] [--criteria <text,...>] [--json]
  fulcrum product planning freeform-prompt --prompt <text> [--source-docs <ids>] [--project <id>] [--trace <id>] [--json]
  fulcrum product planning preview --plan <id> --file <path> [--project <id>] [--trace <id>] [--json]
  fulcrum product planning materialize --plan <id> --file <path> [--project <id>] [--trace <id>] [--json]
  fulcrum product review preview --project <id> [--trace <id>] [--json]
  fulcrum product review session save --project <id> --trace <id> --revision <N> --summary <text> [--json]
  fulcrum product review session load --project <id> --trace <id> [--json]
  fulcrum product review session annotate --project <id> --trace <id> --file <path> --line <N> --body <text> [--severity info|warning|error] [--json]
  fulcrum product workflows acceptance-cycle run --file <payload.json> [--json]
`;

const BOOLEAN_FLAGS = new Set<string>(["--json", "--plan-only", "--hide-viewed", "--watch"]);
const VALUE_FLAGS = new Set<string>([
  "--assignee",
  "--agent",
  "--annotation",
  "--annotations-file",
  "--acp-session",
  "--author",
  "--baseline",
  "--body",
  "--boilerplate-paths",
  "--checkpoint",
  "--conventional-label",
  "--criteria",
  "--cycle",
  "--cwd",
  "--decision",
  "--decorations",
  "--diff-file",
  "--doc",
  "--doc-ids",
  "--feedback",
  "--feedback-agent",
  "--feedback-model",
  "--file",
  "--line-end",
  "--line-start",
  "--kind",
  "--line",
  "--limit",
  "--copy-to-worktree",
  "--max-doc-chars",
  "--max-iterations",
  "--mode",
  "--model",
  "--module",
  "--org-slug",
  "--original-code",
  "--plan",
  "--prompt",
  "--prototype-paths",
  "--project",
  "--parent-doc",
  "--permission",
  "--review",
  "--review-file",
  "--revision",
  "--reviewer-agent",
  "--runner",
  "--run-group",
  "--search",
  "--selected-file",
  "--severity",
  "--side",
  "--scope",
  "--run",
  "--source-docs",
  "--source",
  "--sprint",
  "--status",
  "--state-group",
  "--summary",
  "--suggested-code",
  "--task",
  "--task-type",
  "--tasks",
  "--template",
  "--text",
  "--title",
  "--trace",
  "--trigger",
  "--type",
  "--view",
  "--viewed-files",
  "--worker",
  "--labels",
  "--priority",
]);
const KNOWN_FLAGS = new Set<string>([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
  passthrough: string[];
}

export function parseProductArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  const passthrough: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token : token.slice(0, eq);
      if (!KNOWN_FLAGS.has(name)) throw new Error(`unknown flag: ${name}`);
      if (eq !== -1) {
        if (BOOLEAN_FLAGS.has(name)) throw new Error(`flag does not take a value: ${name}`);
        flags[name] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`missing value for flag: ${token}`);
      flags[token] = next;
      i += 1;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags, passthrough };
}

export async function run(argv: readonly string[], opts: ProductRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const resolved = verb === "init" ? null : await resolveCaller(opts);
    try {
      const caller = resolved?.caller ?? null;
      switch (verb) {
        case "init":
          return await runInit(rest, io);
        case "projects":
          return await runProjects(caller!, rest, io);
        case "tasks":
          return await runTasks(caller!, rest, io);
        case "sprints":
          return await runSprints(caller!, rest, io);
        case "custom-fields":
        case "saved-views":
          return printValue([], rest, io.print);
        case "search":
          return await runSearch(caller!, rest, io);
        case "context":
          return await runContext(caller!, rest, io);
        case "reports":
          return await runReports(caller!, rest, io);
        case "review":
          return await runReview(caller!, rest, io);
        case "planning":
          return await runPlanning(caller!, rest, io);
        case "workflows":
          return await runWorkflows(caller!, rest, io);
        default:
          io.printErr(`fulcrum product: unknown verb '${verb}'`);
          io.printErr(HELP);
          io.exit(2);
      }
    } finally {
      await resolved?.cleanup();
    }
  } catch (error) {
    io.printErr(`fulcrum product ${verb}: ${(error as Error).message}`);
    io.exit(isUsageError(error) ? 2 : 1);
  }
}

async function runWorkflows(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, mode, ...rest] = argv;
  if (sub !== "acceptance-cycle" || mode !== "run") {
    return usage(io, "usage: fulcrum product workflows acceptance-cycle run --file <payload.json>");
  }
  const runAcceptanceCycle = requireWorkflows(caller).runAcceptanceCycle;
  if (!runAcceptanceCycle) throw new Error("workflows acceptance cycle caller is not configured");
  return printValue(await runAcceptanceCycle(await jsonFileInput(rest)), rest, io.print);
}

async function runInit(argv: readonly string[], io: Io): Promise<void> {
  validateFlags(argv, new Set(["--json"]));
  return printValue(await initializeLocalProductReadiness(), argv, io.print);
}

async function runProjects(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "list") return usage(io, `fulcrum product projects: unknown verb '${sub ?? ""}'`);
  printValue(await caller.projects?.list({ limit: numberFlag(rest, "--limit") }) ?? [], rest, io.print);
}

async function runTasks(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "create":
      return printValue(await requireTasks(caller).create({
        title: requiredFlag(rest, "--title"),
        projectId: flagValue(rest, "--project"),
      }), rest, io.print);
    case "list": {
      const result = await requireTasks(caller).list({
        projectId: flagValue(rest, "--project"),
        status: flagValue(rest, "--status"),
        assigneeId: flagValue(rest, "--assignee"),
      });
      return printValue(Array.isArray(result) ? result : result.data ?? [], rest, io.print);
    }
    case "workbench": {
      const workbench = requireTasks(caller).manualWorkbench;
      if (!workbench) throw new Error("tasks manual task workbench caller is not configured");
      return printValue(await workbench(manualWorkbenchInput(rest)), rest, io.print);
    }
    case "update": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product tasks update <id> --status <S>");
      return printValue(await requireTasks(caller).update({ id, status: flagValue(rest, "--status") }), rest, io.print);
    }
    case "bulk": {
      const ids = firstArg(rest);
      if (!ids) return usage(io, "usage: fulcrum product tasks bulk <id,id,...> --status <S>");
      const status = requiredFlag(rest, "--status");
      const updated = [];
      for (const id of ids.split(",")) updated.push(await requireTasks(caller).update({ id, status }));
      return printValue(updated, rest, io.print);
    }
    case "move": {
      const id = firstArg(rest);
      const sprintId = flagValue(rest, "--sprint");
      if (!id || !sprintId) return usage(io, "usage: fulcrum product tasks move <id> --sprint <S>");
      return printValue(await requireTasks(caller).update({ id, sprintId }), rest, io.print);
    }
    case "run-preview": {
      const preview = requireTasks(caller).previewDependencyRun;
      if (!preview) throw new Error("tasks dependency run preview caller is not configured");
      return printValue(await preview(dependencyRunPreviewInput(rest)), rest, io.print);
    }
    case "run": {
      const dispatch = requireTasks(caller).dispatchDependencyRun;
      if (!dispatch) throw new Error("tasks dependency run dispatch caller is not configured");
      return printValue(await dispatch(dependencyRunDispatchInput(rest)), rest, io.print);
    }
    case "run-feed": {
      if (flagEnabled(rest, "--watch")) {
        const stream = requireTasks(caller).dependencyRunLiveFeedbackStream;
        if (!stream) throw new Error("tasks dependency run live feedback stream caller is not configured");
        return printSubscriptionEvents(await stream(dependencyRunLiveFeedbackInput(rest)), io.print);
      }
      const feedback = requireTasks(caller).dependencyRunLiveFeedback;
      if (!feedback) throw new Error("tasks dependency run live feedback caller is not configured");
      return printValue(await feedback(dependencyRunLiveFeedbackInput(rest)), rest, io.print);
    }
    case "run-worker": {
      const tick = requireTasks(caller).runDependencyRunWorkerTick;
      if (!tick) throw new Error("tasks dependency run worker caller is not configured");
      return printValue(await tick(dependencyRunWorkerTickInput(rest)), rest, io.print);
    }
    case "qa-review": {
      const record = requireTasks(caller).recordQaReview;
      if (!record) throw new Error("tasks QA review caller is not configured");
      return printValue(await record(await qaReviewInput(rest)), rest, io.print);
    }
    default:
      return usage(io, `fulcrum product tasks: unknown verb '${sub ?? ""}'`);
  }
}

async function runSprints(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list":
      return printValue(await caller.sprints?.list({ projectId: flagValue(rest, "--project") }) ?? [], rest, io.print);
    case "activate": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product sprints activate <id>");
      return printValue(await caller.sprints?.start?.({ id }) ?? { id, status: "active" }, rest, io.print);
    }
    case "complete": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product sprints complete <id>");
      return printValue(await caller.sprints?.close?.({ id, unfinishedDisposition: "backlog" }) ?? { id, status: "completed" }, rest, io.print);
    }
    default:
      return usage(io, `fulcrum product sprints: unknown verb '${sub ?? ""}'`);
  }
}

async function runSearch(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const query = firstArg(argv);
  if (!query) return usage(io, "usage: fulcrum product search <query>");
  printValue(await caller.search?.query({
    query,
    kind: flagValue(argv, "--kind"),
    limit: numberFlag(argv, "--limit") ?? 25,
  }) ?? [], argv, io.print);
}

async function runContext(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "assemble") return usage(io, `fulcrum product context: unknown verb '${sub ?? ""}'`);
  const taskId = flagValue(rest, "--task");
  if (!taskId) return usage(io, "usage: fulcrum product context assemble --task <id>");
  printValue(await caller.context?.assemble?.({ taskId }) ?? { taskId, body: "" }, rest, io.print);
}

async function runReports(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "final-qa": {
      const finalQa = requireReports(caller).finalQa;
      if (!finalQa) throw new Error("reports final QA caller is not configured");
      return printValue(await finalQa(finalQaInput(rest)), rest, io.print);
    }
    case "final-qa-gate": {
      const finalQaFeedbackGate = requireReports(caller).finalQaFeedbackGate;
      if (!finalQaFeedbackGate) throw new Error("reports final QA feedback gate caller is not configured");
      return printValue(await finalQaFeedbackGate(finalQaFeedbackGateInput(rest)), rest, io.print);
    }
    case "uat-handoff": {
      const uatCodeReviewHandoff = requireReports(caller).uatCodeReviewHandoff;
      if (!uatCodeReviewHandoff) throw new Error("reports UAT/code review handoff caller is not configured");
      return printValue(await uatCodeReviewHandoff(finalQaInput(rest)), rest, io.print);
    }
    case "decision": {
      const recordDecision = requireReports(caller).recordUatCodeReviewDecision;
      if (!recordDecision) throw new Error("reports UAT/code review decision caller is not configured");
      return printValue(await recordDecision(uatDecisionInput(rest)), rest, io.print);
    }
    case "auto-decision": {
      const applyAutoDecision = requireReports(caller).applyConfiguredUatCodeReviewDecision;
      if (!applyAutoDecision) throw new Error("reports configured UAT/code review auto-decision caller is not configured");
      return printValue(await applyAutoDecision(finalQaInput(rest)), rest, io.print);
    }
    case "e2e-run": {
      const runGeneratedE2e = requireReports(caller).runGeneratedE2eRegressionTests;
      if (!runGeneratedE2e) throw new Error("reports generated E2E runner caller is not configured");
      return printValue(await runGeneratedE2e(e2eRunInput(rest)), rest, io.print);
    }
    case "review-workbench": {
      const reviewWorkbench = requireReports(caller).reviewWorkbench;
      if (!reviewWorkbench) throw new Error("reports review workbench caller is not configured");
      return printValue(await reviewWorkbench(await reviewWorkbenchInput(rest)), rest, io.print);
    }
    case "review-session": {
      const [mode, ...sessionRest] = rest;
      if (mode === "save") {
        const save = requireReports(caller).saveReviewWorkbenchSession;
        if (!save) throw new Error("reports review session save caller is not configured");
        return printValue(await save(await reviewWorkbenchSessionSaveInput(sessionRest)), sessionRest, io.print);
      }
      if (mode === "load") {
        const load = requireReports(caller).loadReviewWorkbenchSession;
        if (!load) throw new Error("reports review session load caller is not configured");
        return printValue(await load(reviewWorkbenchSessionLoadInput(sessionRest)), sessionRest, io.print);
      }
      if (mode === "annotate") {
        const annotate = requireReports(caller).appendReviewWorkbenchAnnotation;
        if (!annotate) throw new Error("reports review session annotation caller is not configured");
        return printValue(await annotate(reviewWorkbenchSessionAnnotateInput(sessionRest)), sessionRest, io.print);
      }
      return usage(io, "usage: fulcrum product reports review-session <save|load|annotate>");
    }
    default:
      return usage(io, `fulcrum product reports: unknown verb '${sub ?? ""}'`);
  }
}

async function runReview(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "preview": {
      const reviewWorkbench = requireReports(caller).reviewWorkbench;
      if (!reviewWorkbench) throw new Error("review preview caller is not configured");
      return printValue(await reviewWorkbench(reviewPreviewInput(rest)), rest, io.print);
    }
    case "session": {
      const [mode, ...sessionRest] = rest;
      if (mode === "save") {
        const save = requireReports(caller).saveReviewWorkbenchSession;
        if (!save) throw new Error("review session save caller is not configured");
        return printValue(await save(reviewSessionSaveInput(sessionRest)), sessionRest, io.print);
      }
      if (mode === "load") {
        const load = requireReports(caller).loadReviewWorkbenchSession;
        if (!load) throw new Error("review session load caller is not configured");
        return printValue(await load(reviewSessionLoadInput(sessionRest)), sessionRest, io.print);
      }
      if (mode === "annotate") {
        const annotate = requireReports(caller).appendReviewWorkbenchAnnotation;
        if (!annotate) throw new Error("review session annotate caller is not configured");
        return printValue(await annotate(reviewSessionAnnotateInput(sessionRest)), sessionRest, io.print);
      }
      return usage(io, "usage: fulcrum product review session <save|load|annotate>");
    }
    default:
      return usage(io, `fulcrum product review: unknown verb '${sub ?? ""}'`);
  }
}

async function runPlanning(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "freeform-start": {
      const start = requirePlanning(caller).startFreeformWorkFromDocs;
      if (!start) throw new Error("planning freeform start caller is not configured");
      return printValue(await start(freeformStartInput(rest)), rest, io.print);
    }
    case "guided-acp-start": {
      const start = requirePlanning(caller).startGuidedAcpPlanningSession;
      if (!start) throw new Error("planning guided ACP start caller is not configured");
      return printValue(await start(guidedAcpStartInput(rest)), rest, io.print);
    }
    case "freeform-prompt": {
      const input = freeformPlanningInput(rest);
      const buildPrompt = requirePlanning(caller).buildFreeformDocsPlanningPrompt;
      if (!buildPrompt) throw new Error("planning freeform prompt caller is not configured");
      return printValue(await buildPrompt(input), rest, io.print);
    }
    case "continuous-update": {
      const restart = requirePlanning(caller).restartPlanningCycleFromUpdates;
      if (!restart) throw new Error("planning continuous update caller is not configured");
      return printValue(await restart(continuousUpdateInput(rest)), rest, io.print);
    }
    case "generate": {
      const generate = requirePlanning(caller).generateTechnicalPlanningCycle;
      if (!generate) throw new Error("planning technical generation caller is not configured");
      return printValue(await generate(technicalPlanningInput(rest)), rest, io.print);
    }
    case "preview": {
      const input = await approvedPlanInput(rest);
      return printValue(await requirePlanning(caller).previewApprovedPlanBreakdown(input), rest, io.print);
    }
    case "materialize": {
      const input = await approvedPlanInput(rest);
      return printValue(await requirePlanning(caller).materializeApprovedPlanBreakdown(input), rest, io.print);
    }
    default:
      return usage(io, `fulcrum product planning: unknown verb '${sub ?? ""}'`);
  }
}

async function resolveCaller(opts: ProductRunOptions): Promise<{ caller: ProductCaller; cleanup: () => Promise<void> }> {
  if (opts.caller) return { caller: opts.caller, cleanup: async () => {} };
  const publicCaller = createProductPublicApiCaller(opts.env, opts.fetch);
  if (publicCaller) return { caller: publicCaller, cleanup: async () => {} };
  throw new Error("Product API caller is not configured");
}

function createProductPublicApiCaller(
  env: Record<string, string | undefined> | undefined,
  fetchFn: typeof fetch | undefined,
): ProductCaller | null {
  const projectApi = createProjectApiCallerFromEnv(env, fetchFn);
  const taskApi = createTaskApiCallerFromEnv(env, fetchFn);
  const sprintApi = createSprintApiCallerFromEnv(env, fetchFn);
  const searchApi = createSearchApiCallerFromEnv(env, fetchFn);
  const memoryApi = createMemoryApiCallerFromEnv(env, fetchFn);
  const workflowApi = createWorkflowApiCallerFromEnv(env, fetchFn);
  const caller: ProductCaller = {};

  if (projectApi) {
    caller.projects = {
      list: async () => await projectApi.projects.list() as unknown[],
    };
  }

  if (taskApi) {
    caller.tasks = {
      ...taskApi.tasks,
      list: async (input?: Record<string, unknown>) => {
        const result = await taskApi.tasks.list(input);
        if (Array.isArray(result)) return result;
        const record = result as { data?: unknown[] };
        return record.data ? { data: record.data } : [];
      },
      update: async (input: Record<string, unknown>) => {
        const sprintId = input["sprintId"];
        const taskId = input["id"];
        if (sprintId && taskId && sprintApi) {
          return await sprintApi.sprints.addTask({ id: String(sprintId), taskId: String(taskId) });
        }
        return await taskApi.tasks.update(input as Record<string, unknown> & { id: string });
      },
    };
  }

  if (sprintApi) {
    caller.sprints = {
      list: async (input?: Record<string, unknown>) => await sprintApi.sprints.list(input) as unknown[],
      start: async (input: { id: string }) => await sprintApi.sprints.update({ id: input.id, status: "active" }),
      close: async (input: Record<string, unknown>) =>
        await sprintApi.sprints.update({ ...input, id: String(input["id"]), status: "completed" }),
    };
  }

  if (searchApi) {
    caller.search = {
      query: async (input: Record<string, unknown>) => {
        const result = await searchApi.search.query(input);
        if (Array.isArray(result)) return result;
        const record = result as { data?: unknown[]; results?: unknown[] };
        return record.results ?? record.data ?? [];
      },
    };
  }

  if (memoryApi) {
    caller.context = {
      assemble: async (input: Record<string, unknown>) => await memoryApi.context.preview(input),
    };
  }

  if (workflowApi) {
    caller.planning = workflowApi.planning;
    caller.reports = workflowApi.reports;
    caller.workflows = workflowApi.workflows;
    caller.tasks = {
      ...(caller.tasks ?? {}),
      ...workflowApi.tasks,
    } as NonNullable<ProductCaller["tasks"]>;
  }

  return Object.keys(caller).length > 0 ? caller : null;
}

function requireTasks(caller: ProductCaller): NonNullable<ProductCaller["tasks"]> {
  if (!caller.tasks) throw new Error("tasks caller is not configured");
  return caller.tasks;
}

function requirePlanning(caller: ProductCaller): NonNullable<ProductCaller["planning"]> {
  if (!caller.planning) throw new Error("planning caller is not configured");
  return caller.planning;
}

function requireReports(caller: ProductCaller): NonNullable<ProductCaller["reports"]> {
  if (!caller.reports) throw new Error("reports caller is not configured");
  return caller.reports;
}

function requireWorkflows(caller: ProductCaller): NonNullable<ProductCaller["workflows"]> {
  if (!caller.workflows) throw new Error("workflows caller is not configured");
  return caller.workflows;
}

async function jsonFileInput(argv: readonly string[]): Promise<Record<string, unknown>> {
  const file = requiredFlag(argv, "--file");
  const parsed = JSON.parse(await readFile(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--file must contain a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function approvedPlanInput(argv: readonly string[]): Promise<Record<string, unknown>> {
  const planId = requiredFlag(argv, "--plan");
  const file = requiredFlag(argv, "--file");
  const approvedPlanMarkdown = await readFile(file, "utf8");
  return compact({
    planId,
    approvedPlanMarkdown,
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    reviewId: flagValue(argv, "--review"),
    cycleId: flagValue(argv, "--cycle"),
    moduleId: flagValue(argv, "--module"),
    sourceDocRefs: sourceDocRefs(flagValue(argv, "--source-docs")),
  });
}

function freeformStartInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    title: requiredFlag(argv, "--title"),
    bodyMd: requiredFlag(argv, "--body"),
    userPrompt: requiredFlag(argv, "--prompt"),
    projectId: flagValue(argv, "--project"),
    parentId: flagValue(argv, "--parent-doc"),
    traceId: flagValue(argv, "--trace"),
    acpSessionId: flagValue(argv, "--acp-session"),
    modeId: flagValue(argv, "--mode"),
    modelId: flagValue(argv, "--model"),
    maxDocChars: numberFlag(argv, "--max-doc-chars"),
  });
}

function guidedAcpStartInput(argv: readonly string[]): Record<string, unknown> {
  const permissionMode = flagValue(argv, "--permission");
  if (
    permissionMode &&
    permissionMode !== "review_each_tool" &&
    permissionMode !== "allow_workspace" &&
    permissionMode !== "read_only"
  ) {
    throw new Error("--permission must be review_each_tool, allow_workspace, or read_only");
  }
  return compact({
    acpSessionId: flagValue(argv, "--acp-session"),
    agentName: requiredFlag(argv, "--agent"),
    cwd: requiredFlag(argv, "--cwd"),
    userPrompt: requiredFlag(argv, "--prompt"),
    promptTemplateId: flagValue(argv, "--template"),
    selectedDocIds: csvFlag(flagValue(argv, "--source-docs")),
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    modeId: flagValue(argv, "--mode"),
    modelId: flagValue(argv, "--model"),
    permissionMode,
    maxDocChars: numberFlag(argv, "--max-doc-chars"),
  });
}

function freeformPlanningInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    userPrompt: requiredFlag(argv, "--prompt"),
    selectedDocIds: csvFlag(flagValue(argv, "--source-docs")),
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    maxDocChars: numberFlag(argv, "--max-doc-chars"),
  });
}

function continuousUpdateInput(argv: readonly string[]): Record<string, unknown> {
  const trigger = requiredFlag(argv, "--trigger");
  if (trigger !== "manual_doc_edit" && trigger !== "acp_session_update") {
    throw new Error("--trigger must be manual_doc_edit or acp_session_update");
  }
  const changedDoc = compact({
    id: flagValue(argv, "--doc"),
    title: flagValue(argv, "--title"),
    bodyMd: flagValue(argv, "--body"),
  });
  const changedDocs = Object.keys(changedDoc).length > 0 ? [changedDoc] : undefined;
  return compact({
    trigger,
    userPrompt: requiredFlag(argv, "--prompt"),
    selectedDocIds: csvFlag(flagValue(argv, "--source-docs")),
    targetTaskIds: csvFlag(flagValue(argv, "--tasks")),
    changedDocs,
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    acpSessionId: flagValue(argv, "--acp-session"),
    modeId: flagValue(argv, "--mode"),
    modelId: flagValue(argv, "--model"),
    maxDocChars: numberFlag(argv, "--max-doc-chars"),
  });
}

function technicalPlanningInput(argv: readonly string[]): Record<string, unknown> {
  const source = requiredFlag(argv, "--source");
  if (source !== "freeform_docs" && source !== "guided_acp" && source !== "continuous_update") {
    throw new Error("--source must be freeform_docs, guided_acp, or continuous_update");
  }
  return compact({
    source,
    userPrompt: requiredFlag(argv, "--prompt"),
    selectedDocIds: csvFlag(flagValue(argv, "--source-docs")),
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    maxDocChars: numberFlag(argv, "--max-doc-chars"),
    planId: flagValue(argv, "--plan"),
    reviewId: flagValue(argv, "--review"),
    prototypePaths: csvFlag(flagValue(argv, "--prototype-paths")),
    boilerplatePaths: csvFlag(flagValue(argv, "--boilerplate-paths")),
    successCriteria: csvFlag(flagValue(argv, "--criteria")),
  });
}

function dependencyRunPreviewInput(argv: readonly string[]): Record<string, unknown> {
  const explicitTasks = csvFlag(flagValue(argv, "--tasks"));
  const singleTask = flagValue(argv, "--task");
  const targetTaskIds = explicitTasks ?? (singleTask ? [singleTask] : undefined);
  if (!targetTaskIds?.length) throw new Error("missing required flag --task or --tasks");
  const mode = flagValue(argv, "--mode") ?? (targetTaskIds.length > 1 ? "board" : "task");
  if (mode !== "task" && mode !== "board") throw new Error("--mode must be task or board");
  return compact({
    mode,
    targetTaskIds,
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
  });
}

function manualWorkbenchInput(argv: readonly string[]): Record<string, unknown> {
  const viewMode = flagValue(argv, "--view");
  if (viewMode && viewMode !== "board" && viewMode !== "list" && viewMode !== "table") {
    throw new Error("--view must be board, list, or table");
  }
  const priority = numberFlag(argv, "--priority");
  return compact({
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    viewMode,
    filters: compact({
      statuses: csvFlag(flagValue(argv, "--status")),
      stateGroups: csvFlag(flagValue(argv, "--state-group")),
      labels: csvFlag(flagValue(argv, "--labels")),
      assigneeIds: csvFlag(flagValue(argv, "--assignee")),
      cycleIds: csvFlag(flagValue(argv, "--cycle")),
      moduleIds: csvFlag(flagValue(argv, "--module")),
      taskTypes: csvFlag(flagValue(argv, "--task-type")),
      priorities: priority === undefined ? undefined : [priority],
      search: flagValue(argv, "--search"),
    }),
  });
}

function dependencyRunDispatchInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    ...dependencyRunPreviewInput(argv),
    agent: requiredFlag(argv, "--agent"),
    model: flagValue(argv, "--model"),
    prompt: flagValue(argv, "--prompt"),
  });
}

function dependencyRunLiveFeedbackInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    runGroupId: flagValue(argv, "--run-group"),
    runId: flagValue(argv, "--run"),
    taskId: flagValue(argv, "--task"),
  });
}

function dependencyRunWorkerTickInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: flagValue(argv, "--project"),
    traceId: requiredFlag(argv, "--trace"),
    workerId: flagValue(argv, "--worker"),
    cwd: flagValue(argv, "--cwd"),
  });
}

async function qaReviewInput(argv: readonly string[]): Promise<Record<string, unknown>> {
  const reviewFile = requiredFlag(argv, "--review-file");
  return compact({
    taskId: requiredFlag(argv, "--task"),
    runId: flagValue(argv, "--run"),
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    reviewType: flagValue(argv, "--type") ?? "code",
    reviewerAgent: flagValue(argv, "--reviewer-agent"),
    feedbackAgent: flagValue(argv, "--feedback-agent"),
    feedbackModel: flagValue(argv, "--feedback-model"),
    baseline: flagValue(argv, "--baseline"),
    checkpointId: flagValue(argv, "--checkpoint"),
    summary: flagValue(argv, "--summary"),
    reviewText: await readFile(reviewFile, "utf8"),
  });
}

function finalQaInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    taskIds: csvFlag(flagValue(argv, "--tasks")),
  });
}

function finalQaFeedbackGateInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    ...finalQaInput(argv),
    workerId: flagValue(argv, "--worker"),
    reviewerAgent: flagValue(argv, "--reviewer-agent"),
    feedbackAgent: flagValue(argv, "--feedback-agent"),
    feedbackModel: flagValue(argv, "--feedback-model"),
    maxIterations: numberFlag(argv, "--max-iterations"),
    cwd: flagValue(argv, "--cwd"),
    copyToWorktree: csvFlag(flagValue(argv, "--copy-to-worktree")),
  });
}

function uatDecisionInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    decision: requiredFlag(argv, "--decision"),
    reviewType: requiredFlag(argv, "--type"),
    feedbackText: flagValue(argv, "--feedback"),
    feedbackAgent: flagValue(argv, "--feedback-agent"),
    feedbackModel: flagValue(argv, "--feedback-model"),
    taskIds: csvFlag(flagValue(argv, "--tasks")),
    e2eRunner: flagValue(argv, "--runner"),
  });
}

function e2eRunInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    taskIds: csvFlag(flagValue(argv, "--tasks")),
    runner: flagValue(argv, "--runner"),
    planOnly: argv.includes("--plan-only") ? true : undefined,
  });
}

async function reviewWorkbenchInput(argv: readonly string[]): Promise<Record<string, unknown>> {
  const diffFile = requiredFlag(argv, "--diff-file");
  const annotationsFile = flagValue(argv, "--annotations-file");
  return compact({
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    reviewId: flagValue(argv, "--review"),
    files: JSON.parse(await readFile(diffFile, "utf8")),
    annotations: annotationsFile ? JSON.parse(await readFile(annotationsFile, "utf8")) : [],
    searchQuery: flagValue(argv, "--search"),
    selectedFilePath: flagValue(argv, "--selected-file"),
    viewedFilePaths: csvFlag(flagValue(argv, "--viewed-files")),
    hideViewedFiles: argv.includes("--hide-viewed") ? true : undefined,
  });
}

async function reviewWorkbenchSessionSaveInput(argv: readonly string[]): Promise<Record<string, unknown>> {
  return compact({
    ...(await reviewWorkbenchInput(argv)),
    projectId: requiredFlag(argv, "--project"),
    reviewType: flagValue(argv, "--type"),
    title: flagValue(argv, "--title"),
  });
}

function reviewWorkbenchSessionLoadInput(argv: readonly string[]): Record<string, unknown> {
  const reviewId = flagValue(argv, "--review");
  const traceId = flagValue(argv, "--trace");
  if (!reviewId && !traceId) throw new Error("missing required flag --review or --trace");
  return compact({
    projectId: requiredFlag(argv, "--project"),
    reviewId,
    traceId,
    searchQuery: flagValue(argv, "--search"),
    selectedFilePath: flagValue(argv, "--selected-file"),
    viewedFilePaths: csvFlag(flagValue(argv, "--viewed-files")),
    hideViewedFiles: argv.includes("--hide-viewed") ? true : undefined,
  });
}

function reviewWorkbenchSessionAnnotateInput(argv: readonly string[]): Record<string, unknown> {
  const reviewId = flagValue(argv, "--review");
  const traceId = flagValue(argv, "--trace");
  if (!reviewId && !traceId) throw new Error("missing required flag --review or --trace");
  return compact({
    projectId: requiredFlag(argv, "--project"),
    reviewId,
    traceId,
    annotationId: flagValue(argv, "--annotation"),
    type: flagValue(argv, "--type"),
    scope: flagValue(argv, "--scope"),
    filePath: requiredFlag(argv, "--file"),
    lineStart: requiredNumberFlag(argv, "--line-start"),
    lineEnd: requiredNumberFlag(argv, "--line-end"),
    side: flagValue(argv, "--side"),
    text: flagValue(argv, "--text"),
    suggestedCode: flagValue(argv, "--suggested-code"),
    originalCode: flagValue(argv, "--original-code"),
    severity: flagValue(argv, "--severity"),
    conventionalLabel: flagValue(argv, "--conventional-label"),
    decorations: csvFlag(flagValue(argv, "--decorations")),
    author: flagValue(argv, "--author"),
    source: flagValue(argv, "--source"),
    selectedFilePath: flagValue(argv, "--selected-file"),
    viewedFilePaths: csvFlag(flagValue(argv, "--viewed-files")),
    hideViewedFiles: argv.includes("--hide-viewed") ? true : undefined,
    searchQuery: flagValue(argv, "--search"),
  });
}

// ── W5 review shorthand input builders ──────────────────────────────

function reviewPreviewInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    files: [],
    annotations: [],
  });
}

function reviewSessionSaveInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: requiredFlag(argv, "--trace"),
    revision: requiredNumberFlag(argv, "--revision"),
    summary: requiredFlag(argv, "--summary"),
    files: [],
    annotations: [],
  });
}

function reviewSessionLoadInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: requiredFlag(argv, "--trace"),
  });
}

function reviewSessionAnnotateInput(argv: readonly string[]): Record<string, unknown> {
  const severity = flagValue(argv, "--severity");
  if (severity && severity !== "info" && severity !== "warning" && severity !== "error") {
    throw new Error("--severity must be info, warning, or error");
  }
  const lineNum = requiredNumberFlag(argv, "--line");
  return compact({
    projectId: requiredFlag(argv, "--project"),
    traceId: requiredFlag(argv, "--trace"),
    filePath: requiredFlag(argv, "--file"),
    lineStart: lineNum,
    lineEnd: lineNum,
    text: requiredFlag(argv, "--body"),
    severity,
  });
}

function sourceDocRefs(value: string | undefined): Array<{ kind: "doc"; id: string }> | undefined {
  const ids = csvFlag(value) ?? [];
  if (ids.length === 0) return undefined;
  return ids.map((id) => ({ kind: "doc", id }));
}

function csvFlag(value: string | undefined): string[] | undefined {
  const values = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return values.length ? values : undefined;
}

function printValue(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : formatValue(value));
}

function formatValue(value: unknown): string {
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

function usage(io: Pick<Io, "printErr" | "exit">, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function firstArg(argv: readonly string[]): string | undefined {
  return parseProductArgs(argv).positionals[0];
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const value = parseProductArgs(argv).flags[flag];
  return typeof value === "string" ? value : undefined;
}

function flagEnabled(argv: readonly string[], flag: string): boolean {
  return parseProductArgs(argv).flags[flag] === true;
}

function requiredFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (!value) throw new Error(`missing required flag ${flag}`);
  return value;
}

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

async function printSubscriptionEvents(
  stream: SubscriptionLike,
  print: (line: string) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let done = false;
    let subscription: { unsubscribe?(): void } | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      subscription?.unsubscribe?.();
      resolve();
    };
    try {
      subscription = stream.subscribe({
        next(value) {
          if (done) return;
          print(JSON.stringify(value));
          if (isInactiveFeedback(value)) finish();
        },
        error(error) {
          if (done) return;
          done = true;
          reject(error);
        },
        complete: finish,
      });
      if (done) subscription.unsubscribe?.();
    } catch (error) {
      reject(error);
    }
  });
}

function isInactiveFeedback(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { executorStatus?: { active?: unknown } }).executorStatus;
  return status?.active === false;
}

function requiredNumberFlag(argv: readonly string[], flag: string): number {
  const value = numberFlag(argv, flag);
  if (value === undefined) throw new Error(`missing required flag ${flag}`);
  return value;
}

function validateFlags(argv: readonly string[], allowed: ReadonlySet<string>): void {
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const name = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (!allowed.has(name)) throw new Error(`unknown flag: ${name}`);
  }
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

type Io = Required<Pick<ProductRunOptions, "print" | "printErr" | "exit">>;

function ioFor(opts: ProductRunOptions): Io {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function isUsageError(error: unknown): boolean {
  const message = (error as Error).message ?? "";
  return message.startsWith("unknown flag:") ||
    message.startsWith("missing value for flag:") ||
    message.startsWith("flag does not take a value:") ||
    message.startsWith("missing required flag");
}
