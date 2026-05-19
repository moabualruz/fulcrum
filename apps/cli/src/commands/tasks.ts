import { formatApiError } from "../api-errors.ts";
import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

type TaskCaller = {
  tasks: {
    list(input?: { includeDeleted?: boolean; sortField?: TaskSortField; sortDirection?: TaskSortDirection; projectId?: string }): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    create(input: Record<string, unknown>): Promise<unknown>;
    update(input: Record<string, unknown>): Promise<unknown>;
    delete(input: { id: string }): Promise<unknown>;
  };
};

export interface TasksRunOptions {
  caller?: TaskCaller;
  env?: TaskApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum tasks

Usage:
  fulcrum tasks list [--include-deleted] [--sort <field>:<asc|desc>] [--json]
  fulcrum tasks get <id> [--json]
  fulcrum tasks new --title <title> --project <id> [--sprint <id>] [--module <id>] [--cycle <id>] [--recurrence <rule>] [--json]
  fulcrum tasks create --title <title> [--project <id>] [--status <status>] [--points <n>] [--json]
  fulcrum tasks update <id> [--title <title>] [--status <status>] [--points <n>] [--json]
  fulcrum tasks delete <id> [--json]
`;

export async function run(argv: readonly string[], opts: TasksRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "list": {
        const caller = await resolveCaller(opts);
        const sort = parseSort(rest, io);
        if (sort === "invalid") return;
        const rows = await caller.tasks.list(compact({
          includeDeleted: rest.includes("--include-deleted") ? true : undefined,
          sortField: sort?.field,
          sortDirection: sort?.direction,
        }));
        return printTaskListOutput(sort ? sortRows(rows, sort) : rows, sort, rest, io.print);
      }
      case "get": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.get({ id: requiredArg(rest, "get", "<id>") }), rest, io.print);
      }
      case "new": {
        const caller = await resolveCaller(opts);
        return await createTaskFromCli(caller, rest, "new", io);
      }
      case "create": {
        const caller = await resolveCaller(opts);
        return await createTaskFromCli(caller, rest, "create", io);
      }
      case "update": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.update(compact({
          id: requiredArg(rest, "update", "<id>"),
          title: flagValue(rest, "--title"),
          status: flagValue(rest, "--status"),
          points: numberFlag(rest, "--points"),
        })), rest, io.print);
      }
      case "delete": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.delete({ id: requiredArg(rest, "delete", "<id>") }), rest, io.print);
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum tasks: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum tasks ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: TasksRunOptions): Promise<TaskCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.",
    );
  }
  return apiCaller as TaskCaller;
}

type TaskSortField = "priority" | "key" | "updated" | "title" | "status";
type TaskSortDirection = "asc" | "desc";
type TaskSort = { field: TaskSortField; direction: TaskSortDirection };

const TASK_SORT_FIELDS = new Set<TaskSortField>(["priority", "key", "updated", "title", "status"]);
const TASK_SORT_DIRECTIONS = new Set<TaskSortDirection>(["asc", "desc"]);
const PRIORITY_ORDER = new Map<string, number>([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
  ["P4", 4],
  ["urgent", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
]);

function parseSort(argv: readonly string[], io: Pick<Required<TasksRunOptions>, "printErr" | "exit">): TaskSort | "invalid" | undefined {
  const value = flagValue(argv, "--sort");
  if (!value) return undefined;
  const [field, direction] = value.split(":");
  if (!TASK_SORT_FIELDS.has(field as TaskSortField) || !TASK_SORT_DIRECTIONS.has(direction as TaskSortDirection)) {
    io.printErr("invalid --sort. Usage: fulcrum tasks list --sort <priority|key|updated|title|status>:<asc|desc>");
    io.exit(2);
    return "invalid";
  }
  return { field: field as TaskSortField, direction: direction as TaskSortDirection };
}

function sortRows(rows: unknown[], sort: TaskSort): unknown[] {
  return [...rows].sort((left, right) => compareTaskRows(left, right, sort));
}

function compareTaskRows(left: unknown, right: unknown, sort: TaskSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const leftValue = sortValue(left, sort.field);
  const rightValue = sortValue(right, sort.field);
  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;
  if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * direction;
  return String(leftValue).localeCompare(String(rightValue), "en", { numeric: true, sensitivity: "base" }) * direction;
}

function sortValue(row: unknown, field: TaskSortField): string | number | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (field === "key") return primitive(record["key"] ?? record["id"]);
  if (field === "updated") return primitive(record["updatedAt"] ?? record["updated_at"]);
  if (field === "priority") {
    const value = primitive(record["priority"]);
    if (value == null) return null;
    return PRIORITY_ORDER.get(String(value)) ?? String(value);
  }
  return primitive(record[field]);
}

function primitive(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function printTaskListOutput(rows: unknown[], sort: TaskSort | undefined, argv: readonly string[], print: (line: string) => void): void {
  if (!sort) return printOutput(rows, argv, print);
  const payload = { data: rows, sort };
  print(argv.includes("--json") ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
}

function printOutput(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

async function createTaskFromCli(
  caller: TaskCaller,
  argv: readonly string[],
  command: "create" | "new",
  io: Required<Pick<TasksRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const input = compact({
    title: flagValue(argv, "--title"),
    projectId: flagValue(argv, "--project"),
    status: flagValue(argv, "--status"),
    points: numberFlag(argv, "--points"),
    parentId: flagValue(argv, "--parent"),
    sprintId: flagValue(argv, "--sprint"),
    moduleId: flagValue(argv, "--module"),
    cycleId: flagValue(argv, "--cycle"),
    dependsOn: csvFlag(flagValue(argv, "--depends-on")),
    recurrence: flagValue(argv, "--recurrence"),
  });
  const title = typeof input["title"] === "string" ? input["title"].trim() : "";
  if (!title) {
    printCreateFailure(command, "title is required", input, argv, io);
    return;
  }
  input["title"] = title;

  const recurrencePreview = typeof input["recurrence"] === "string" ? buildRecurrencePreview(input["recurrence"]) : undefined;
  const generatedInstanceSummary = recurrencePreview ? {
    count: recurrencePreview.instances.length,
    first: recurrencePreview.instances[0] ?? null,
    last: recurrencePreview.instances.at(-1) ?? null,
  } : undefined;

  try {
    await assertNoDuplicateTask(caller, input);
    if (!argv.includes("--json")) printCreateScope(input, recurrencePreview, io.print);
    const created = await caller.tasks.create(input);
    const richOutput = command === "new" || recurrencePreview || hasScopeFields(input)
      ? compact({
          task: created,
          scope: taskScope(input),
          recurrencePreview,
          generatedInstanceSummary,
        })
      : created;
    printOutput(richOutput, argv, io.print);
  } catch (error) {
    printCreateFailure(command, errorMessage(error), input, argv, io);
  }
}

async function assertNoDuplicateTask(caller: TaskCaller, input: Record<string, unknown>): Promise<void> {
  const title = String(input["title"] ?? "").trim().toLowerCase();
  const projectId = primitive(input["projectId"]);
  if (!title || !projectId) return;
  const rows = await caller.tasks.list({ projectId: String(projectId) });
  const duplicate = rows.find((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return String(record["title"] ?? "").trim().toLowerCase() === title;
  });
  if (duplicate) throw new Error(`duplicate task title in project ${projectId}`);
}

function printCreateScope(
  input: Record<string, unknown>,
  recurrencePreview: ReturnType<typeof buildRecurrencePreview> | undefined,
  print: (line: string) => void,
): void {
  const scope = taskScope(input);
  print("Task create scope");
  print(`Project: ${scope.projectId ?? "(none)"}`);
  print(`Sprint: ${scope.sprintId ?? "(none)"}`);
  print(`Module: ${scope.moduleId ?? "(none)"}`);
  print(`Cycle: ${scope.cycleId ?? "(none)"}`);
  if (recurrencePreview) {
    print(`Recurrence: ${recurrencePreview.summary}`);
  }
}

function printCreateFailure(
  command: string,
  reason: string,
  input: Record<string, unknown>,
  argv: readonly string[],
  io: Required<Pick<TasksRunOptions, "print" | "printErr" | "exit">>,
): void {
  const payload = compact({
    error: reason,
    entered: input,
    retry: retryCommand(command, input, argv.includes("--json")),
  });
  io.printErr(`fulcrum tasks ${command}: ${reason}`);
  io.printErr(JSON.stringify(payload, null, 2));
  io.exit(1);
}

function taskScope(input: Record<string, unknown>): Record<string, unknown> {
  return compact({
    projectId: input["projectId"],
    sprintId: input["sprintId"],
    moduleId: input["moduleId"],
    cycleId: input["cycleId"],
    parentId: input["parentId"],
    dependsOn: input["dependsOn"],
  });
}

function hasScopeFields(input: Record<string, unknown>): boolean {
  return Object.keys(taskScope(input)).length > 0;
}

function buildRecurrencePreview(rule: string): { rule: string; summary: string; instances: string[] } {
  const normalized = rule.trim();
  const today = new Date("2026-05-19T00:00:00.000Z");
  const lower = normalized.toLowerCase();
  const stepDays = lower.includes("daily") ? 1 : lower.includes("weekly") ? 7 : lower.includes("monthly") ? 30 : 7;
  const label = stepDays === 1 ? "daily" : stepDays === 30 ? "monthly" : "weekly";
  const instances = [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset * stepDays);
    return date.toISOString().slice(0, 10);
  });
  return {
    rule: normalized,
    summary: `${label} preview: ${instances.join(", ")}`,
    instances,
  };
}

function retryCommand(command: string, input: Record<string, unknown>, json: boolean): string {
  const flags = [
    ["--title", input["title"]],
    ["--project", input["projectId"]],
    ["--sprint", input["sprintId"]],
    ["--module", input["moduleId"]],
    ["--cycle", input["cycleId"]],
    ["--parent", input["parentId"]],
    ["--depends-on", Array.isArray(input["dependsOn"]) ? input["dependsOn"].join(",") : undefined],
    ["--recurrence", input["recurrence"]],
    ["--status", input["status"]],
    ["--points", input["points"]],
  ].flatMap(([flag, value]) => value === undefined ? [] : [String(flag), shellQuote(String(value))]);
  return ["fulcrum", "tasks", command, ...flags, ...(json ? ["--json"] : [])].join(" ");
}

function csvFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function shellQuote(value: string): string {
  return /^[a-zA-Z0-9._:/=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
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

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
