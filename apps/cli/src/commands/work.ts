import { formatApiError } from "../api-errors.ts";
import {
  createReportApiCallerFromEnv,
  type ReportApiEnvironment,
} from "@work-management/interface/http/report-api-client.ts";
import {
  createRelationshipApiCallerFromEnv,
  type RelationshipApiEnvironment,
} from "@work-management/interface/http/relationship-api-client.ts";
import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";
import {
  createWorkflowApiCallerFromEnv,
  type WorkflowApiEnvironment,
} from "@workflow-coordination/interface/http/workflow-api-client.ts";

type WorkCaller = {
  work?: {
    create?(input: Record<string, unknown>): Promise<unknown>;
    inspect?(input: { id: string; mode?: string }): Promise<unknown>;
    move?(input: Record<string, unknown>): Promise<unknown>;
    link?(input: Record<string, unknown>): Promise<unknown>;
    report?(input: Record<string, unknown>): Promise<unknown>;
  };
  tasks?: {
    get?(input: { id: string }): Promise<unknown>;
    update?(input: Record<string, unknown>): Promise<unknown>;
    create?(input: Record<string, unknown>): Promise<unknown>;
    previewDependencyRun?(input: Record<string, unknown>): Promise<unknown>;
    dispatchDependencyRun?(input: Record<string, unknown>): Promise<unknown>;
    dependencyRunLiveFeedback?(input: Record<string, unknown>): Promise<unknown>;
  };
  relationships?: {
    create(input: Record<string, unknown>): Promise<unknown>;
  };
  reports?: {
    burndown(input: Record<string, unknown>): Promise<unknown>;
  };
};

export interface WorkRunOptions {
  caller?: WorkCaller;
  env?: Record<string, string | undefined> & TaskApiEnvironment & RelationshipApiEnvironment & ReportApiEnvironment & WorkflowApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum work

Usage:
  fulcrum work create --title <title> [--type <type>] [--parent <id>] [--cycle <id>] [--module <id>] [--project <id>] [--json]
  fulcrum work inspect <id> [--mode <planning|docs|repo-workspace|agent-run|knowledge|audit-activity>] [--json]
  fulcrum work move <id> --status <status> [--json]
  fulcrum work link <id> --to <id> --type <type> [--json]
  fulcrum work report [--project <id>] [--json]
  fulcrum work dependency-graph --task <id>|--tasks <id,id> [--project <id>] [--trace <id>] [--json]
  fulcrum work dependency-run dispatch --task <id>|--tasks <id,id> --agent <agent> [--project <id>] [--trace <id>] [--model <model>] [--prompt <text>] [--json]
  fulcrum work dependency-run feedback [--project <id>] [--trace <id>] [--run-group <id>] [--run <id>] [--task <id>] [--json]
`;

export async function run(argv: readonly string[], opts: WorkRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "create": {
        const caller = await resolveCaller(opts);
        const projectId = flagValue(rest, "--project");
        const allProjects = rest.includes("--all-projects");
        if (!projectId && !allProjects) throw new Error("missing required scope: pass --project or --all-projects");
        const input = compact({
          title: requiredFlag(rest, "--title"),
          taskType: flagValue(rest, "--type"),
          parentId: flagValue(rest, "--parent"),
          cycleId: flagValue(rest, "--cycle"),
          moduleId: flagValue(rest, "--module"),
          projectId,
          scope: allProjects ? "all" : undefined,
        });
        return printOutput(await createWork(caller, input), rest, io.print);
      }
      case "inspect": {
        const caller = await resolveCaller(opts);
        return printOutput(await inspectWork(caller, {
          id: requiredArg(rest, "inspect", "<id>"),
          mode: flagValue(rest, "--mode"),
        }), rest, io.print);
      }
      case "move":
        {
          const caller = await resolveCaller(opts);
          const fn = caller.work?.move ?? ((input: Record<string, unknown>) => caller.tasks?.update?.(input));
          if (!fn) throw new Error("work move unavailable");
          return printOutput(await fn({
            id: requiredArg(rest, "move", "<id>"),
            status: requiredFlag(rest, "--status"),
          }), rest, io.print);
        }
      case "link": {
        const caller = await resolveCaller(opts);
        const fn = caller.work?.link ?? ((input: Record<string, unknown>) => caller.relationships?.create(input));
        if (!fn) throw new Error("work link unavailable");
        return printOutput(await fn({
          sourceTaskId: requiredArg(rest, "link", "<id>"),
          targetTaskId: requiredFlag(rest, "--to"),
          type: requiredFlag(rest, "--type"),
        }), rest, io.print);
      }
      case "report": {
        const caller = await resolveCaller(opts);
        const fn = caller.work?.report ?? ((input: Record<string, unknown>) => caller.reports?.burndown(input));
        if (!fn) throw new Error("work report unavailable");
        return printOutput(await fn(compact({ projectId: flagValue(rest, "--project") })), rest, io.print);
      }
      case "dependency-graph": {
        const caller = await resolveCaller(opts);
        const fn = caller.tasks?.previewDependencyRun;
        if (!fn) throw new Error("work dependency graph unavailable");
        return printOutput(await fn(dependencyRunPreviewInput(rest)), rest, io.print);
      }
      case "dependency-run": {
        const [sub, ...runRest] = rest;
        const caller = await resolveCaller(opts);
        if (sub === "dispatch") {
          const fn = caller.tasks?.dispatchDependencyRun;
          if (!fn) throw new Error("work dependency run dispatch unavailable");
          return printOutput(await fn(dependencyRunDispatchInput(runRest)), runRest, io.print);
        }
        if (sub === "feedback") {
          const fn = caller.tasks?.dependencyRunLiveFeedback;
          if (!fn) throw new Error("work dependency run feedback unavailable");
          return printOutput(await fn(dependencyRunFeedbackInput(runRest)), runRest, io.print);
        }
        return usage(io, "usage: fulcrum work dependency-run <dispatch|feedback>");
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum work: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum work ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function createWork(caller: WorkCaller, input: Record<string, unknown>): Promise<unknown> {
  if (caller.work?.create) return caller.work.create(input);
  if (caller.tasks?.create) return caller.tasks.create(input);
  throw new Error("work create unavailable");
}

async function inspectWork(caller: WorkCaller, input: { id: string; mode?: string }): Promise<unknown> {
  if (caller.tasks?.get) return caller.tasks.get(input);
  if (!caller.work?.inspect) throw new Error("work inspect unavailable");
  return caller.work.inspect(input);
}

async function resolveCaller(opts: WorkRunOptions): Promise<WorkCaller> {
  if (opts.caller) return opts.caller;
  const taskCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  const relationshipCaller = createRelationshipApiCallerFromEnv(opts.env, opts.fetch);
  const reportCaller = createReportApiCallerFromEnv(opts.env, opts.fetch);
  const workflowCaller = createWorkflowApiCallerFromEnv(opts.env, opts.fetch);
  if (!taskCaller && !relationshipCaller && !reportCaller && !workflowCaller) {
    throw new Error(
      "Work API callers are not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return {
    tasks: { ...(taskCaller?.tasks ?? {}), ...(workflowCaller?.tasks ?? {}) } as WorkCaller["tasks"],
    relationships: relationshipCaller?.relationships,
    reports: reportCaller?.reports,
  } as WorkCaller;
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

function dependencyRunDispatchInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    ...dependencyRunPreviewInput(argv),
    agent: requiredFlag(argv, "--agent"),
    model: flagValue(argv, "--model"),
    prompt: flagValue(argv, "--prompt"),
  });
}

function dependencyRunFeedbackInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: flagValue(argv, "--project"),
    traceId: flagValue(argv, "--trace"),
    runGroupId: flagValue(argv, "--run-group"),
    runId: flagValue(argv, "--run"),
    taskId: flagValue(argv, "--task"),
  });
}

function requiredArg(argv: readonly string[], command: string, label: string): string {
  const value = argv.find((arg) => !arg.startsWith("-"));
  if (!value) throw new Error(`missing required argument ${label} for ${command}`);
  return value;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function requiredFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (!value) throw new Error(`missing required flag ${flag}`);
  return value;
}

function printOutput(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

function usage(io: { printErr: (line: string) => void; exit: (code: number) => void }, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function csvFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
