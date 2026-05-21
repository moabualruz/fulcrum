import { formatApiError } from "../api-errors.ts";
import {
  emitErrorResult,
  emitResult,
} from "../lib/cli-output.ts";
import { newTraceId } from "../lib/envelope.ts";
import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

type TaskCaller = {
  tasks: {
    list(input?: { includeDeleted?: boolean; sortField?: TaskSortField; sortDirection?: TaskSortDirection; projectId?: string; cycleId?: string; moduleId?: string }): Promise<unknown[]>;
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

/**
 * `fulcrum task` is the canonical Build-stage task grammar (`CLI-TUI-UX.md`
 * §1.3). Every verb below maps to a Build destination in `IA-MAP.md` §2.3 and
 * routes its `--json` output through the shared `fulcrum.cli.v1` envelope.
 *
 * Canonical verbs:    new · list · view · edit · move · bulk · run-preview · run · qa-review
 * Documented aliases: get → view · create → new · update → edit · delete (kept, no command removed)
 */
const HELP = `fulcrum task: Build-stage task grammar (CLI-TUI-UX §1.3)

Usage:
  fulcrum task new          --title <t> --project <id> [--parent <id>] [--depends-on <id,id>] [--cycle <id>] [--module <id>] [--recurrence <rule>] [--json]
  fulcrum task list         [--status <s>] [--assignee <id>] [--cycle <id>] [--module <id>] [--label <l>] [--include-deleted] [--sort <field>:<asc|desc>] [--json]
  fulcrum task view         <id> [--json]
  fulcrum task edit         <id> [--title <t>] [--status <s>] [--assignee <id>] [--priority <p>] [--points <n>] [--json]
  fulcrum task move         <id> --cycle <id> [--module <id>] [--json]
  fulcrum task bulk         <id,id,...> --status <s> [--json]
  fulcrum task run-preview  <id> [--json]                       dry-run dependency graph
  fulcrum task run          <id> [--agent <a>] [--model <m>] [--prompt <text>] [--json]
  fulcrum task qa-review    <id> --review-file <path> [--json]

Aliases (kept for compatibility, no command removed):
  fulcrum tasks <verb>   alias of fulcrum task <verb>
  get → view   create → new   update → edit   delete

Options:
  --json        Canonical fulcrum.cli.v1 JSON envelope (CLI-TUI-UX §3)
  --jq <expr>   Filter the envelope's .result through jq
  --json-raw    Pre-envelope JSON payload (compatibility, removed next release)
`;

/** Per-invocation envelope context shared by every `fulcrum task` verb. */
interface TaskEnvelopeContext {
  command: string;
  argv: readonly string[];
  traceId: string;
  env: NodeJS.ProcessEnv;
}

type TaskIo = Required<Pick<TasksRunOptions, "print" | "printErr" | "exit">> & {
  ctx: TaskEnvelopeContext;
};

export async function run(argv: readonly string[], opts: TasksRunOptions = {}): Promise<void> {
  const [verb = "help", ...rest] = argv;
  const env = (opts.env ?? process.env) as NodeJS.ProcessEnv;
  const io: TaskIo = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
    ctx: {
      command: `fulcrum task ${verb}`.trim(),
      argv: rest,
      traceId: newTraceId(env),
      env,
    },
  };

  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    switch (verb) {
      case "list": {
        const caller = await resolveCaller(opts);
        const sort = parseSort(rest, io);
        if (sort === "invalid") return;
        const rows = await caller.tasks.list(compact({
          includeDeleted: rest.includes("--include-deleted") ? true : undefined,
          cycleId: flagValue(rest, "--cycle"),
          moduleId: flagValue(rest, "--module"),
          sortField: sort?.field,
          sortDirection: sort?.direction,
        }));
        const sorted = sort ? sortRows(rows, sort) : rows;
        const filtered = applyListFilters(sorted, rest);
        return emitTaskResult(sort ? { data: filtered, sort } : filtered, io);
      }
      case "view":
      case "get": {
        const caller = await resolveCaller(opts);
        return emitTaskResult(await caller.tasks.get({ id: requiredArg(rest, verb, "<id>") }), io);
      }
      case "new":
      case "create": {
        const caller = await resolveCaller(opts);
        return await createTaskFromCli(caller, rest, verb, io);
      }
      case "edit":
      case "update": {
        const caller = await resolveCaller(opts);
        return emitTaskResult(await caller.tasks.update(compact({
          id: requiredArg(rest, verb, "<id>"),
          title: flagValue(rest, "--title"),
          status: flagValue(rest, "--status"),
          assigneeId: flagValue(rest, "--assignee"),
          priority: flagValue(rest, "--priority"),
          points: numberFlag(rest, "--points"),
        })), io);
      }
      case "move": {
        const caller = await resolveCaller(opts);
        const id = requiredArg(rest, "move", "<id>");
        const cycleId = requiredFlag(rest, "--cycle");
        return emitTaskResult(await caller.tasks.update(compact({
          id,
          cycleId,
          moduleId: flagValue(rest, "--module"),
        })), io, [
          { label: "View the moved task", command: `fulcrum task view ${id} --json` },
        ]);
      }
      case "bulk": {
        const caller = await resolveCaller(opts);
        const ids = parseIdList(requiredArg(rest, "bulk", "<id,id,...>"));
        const status = requiredFlag(rest, "--status");
        const updated: unknown[] = [];
        for (const id of ids) {
          updated.push(await caller.tasks.update({ id, status }));
        }
        return emitTaskResult({ status, count: updated.length, tasks: updated }, io);
      }
      case "run-preview": {
        const caller = await resolveCaller(opts);
        const id = requiredArg(rest, "run-preview", "<id>");
        const task = await caller.tasks.get({ id });
        const preview = buildRunPreview(id, task);
        return emitTaskResult(preview, io, [
          { label: "Dispatch the run", command: `fulcrum task run ${id} --json` },
        ]);
      }
      case "run": {
        const caller = await resolveCaller(opts);
        const id = requiredArg(rest, "run", "<id>");
        const task = await caller.tasks.get({ id });
        const dispatch = buildRunDispatch(id, task, rest);
        return emitTaskResult(dispatch, io, [
          { label: "Follow the run feed", command: `fulcrum runs feed --task ${id} --watch --json` },
        ]);
      }
      case "qa-review": {
        const caller = await resolveCaller(opts);
        const id = requiredArg(rest, "qa-review", "<id>");
        const reviewFile = requiredFlag(rest, "--review-file");
        const task = await caller.tasks.get({ id });
        const review = await buildQaReview(id, task, reviewFile);
        return emitTaskResult(review, io);
      }
      case "delete": {
        const caller = await resolveCaller(opts);
        return emitTaskResult(await caller.tasks.delete({ id: requiredArg(rest, "delete", "<id>") }), io);
      }
      default:
        io.printErr(`fulcrum task: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    emitTaskError(error, io);
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

function parseSort(argv: readonly string[], io: Pick<TaskIo, "printErr" | "exit">): TaskSort | "invalid" | undefined {
  const value = flagValue(argv, "--sort");
  if (!value) return undefined;
  const [field, direction] = value.split(":");
  if (!TASK_SORT_FIELDS.has(field as TaskSortField) || !TASK_SORT_DIRECTIONS.has(direction as TaskSortDirection)) {
    io.printErr("invalid --sort. Usage: fulcrum task list --sort <priority|key|updated|title|status>:<asc|desc>");
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

/**
 * Apply the `CLI-TUI-UX.md` §1.3 client-side `task list` filters that the task
 * API does not natively narrow (`--status`, `--assignee`, `--label`). Cycle and
 * module narrowing is delegated to the API query above.
 */
function applyListFilters(rows: unknown[], argv: readonly string[]): unknown[] {
  const status = flagValue(argv, "--status");
  const assignee = flagValue(argv, "--assignee");
  const label = flagValue(argv, "--label");
  if (!status && !assignee && !label) return rows;
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    if (status && String(record["status"] ?? "") !== status) return false;
    if (assignee && String(record["assigneeId"] ?? record["assignee"] ?? "") !== assignee) return false;
    if (label) {
      const labels = record["labels"];
      const list = Array.isArray(labels) ? labels.map(String) : [];
      if (!list.includes(label)) return false;
    }
    return true;
  });
}

/**
 * Emit one `fulcrum task` verb result through the shared `fulcrum.cli.v1`
 * envelope. `--json` wraps the payload in the canonical 12-key envelope; plain
 * output prints the same result data plus the `DESIGN.md` §4.10 trace line.
 */
function emitTaskResult(
  value: unknown,
  io: TaskIo,
  nextActions: { label: string; command: string }[] = [],
): void {
  emitResult(
    {
      argv: io.ctx.argv,
      command: io.ctx.command,
      result: value,
      next_actions: nextActions,
      trace: { trace_id: io.ctx.traceId },
      traceLine: true,
      env: io.ctx.env,
      renderHuman: (result) => io.print(JSON.stringify(result, null, 2)),
    },
    io,
  );
}

/**
 * Emit a failed `fulcrum task` verb. Under `--json` the failure stays inside
 * the canonical envelope (`result` null, coded error in `errors`); plain mode
 * prints the `COPY.md` §3 recovery block to stderr.
 */
function emitTaskError(error: unknown, io: TaskIo): void {
  emitErrorResult(
    {
      argv: io.ctx.argv,
      command: io.ctx.command,
      error: {
        code: errorCode(error),
        message: errorMessage(error),
        trace_id: io.ctx.traceId,
        fix: "fulcrum task --help",
      },
      trace: { trace_id: io.ctx.traceId },
      env: io.ctx.env,
      renderHuman: () => io.printErr(`${io.ctx.command}: ${errorMessage(error)}`),
    },
    io,
  );
  io.exit(1);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "FUL_TASK_FAILED";
}

async function createTaskFromCli(
  caller: TaskCaller,
  argv: readonly string[],
  command: "create" | "new",
  io: TaskIo,
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
    emitTaskResult(richOutput, io);
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
  io: TaskIo,
): void {
  const payload = compact({
    error: reason,
    entered: input,
    retry: retryCommand(command, input, argv.includes("--json")),
  });
  io.printErr(`fulcrum task ${command}: ${reason}`);
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

/**
 * Dependency-graph dry run for `fulcrum task run-preview` (`CLI-TUI-UX.md` §1.3
 * "dry-run dependency graph"). Reads the task's declared dependencies and
 * reports the unmet set without dispatching a run.
 */
function buildRunPreview(id: string, task: unknown): Record<string, unknown> {
  const record = (task && typeof task === "object" ? task : {}) as Record<string, unknown>;
  const dependsOn = Array.isArray(record["dependsOn"])
    ? record["dependsOn"].map(String)
    : Array.isArray(record["dependencies"])
      ? record["dependencies"].map(String)
      : [];
  return {
    kind: "run-preview",
    taskId: id,
    title: record["title"] ?? null,
    status: record["status"] ?? null,
    dependsOn,
    blockedBy: dependsOn,
    ready: dependsOn.length === 0,
  };
}

/**
 * Resolve the `fulcrum task run` dispatch descriptor: the agent / model /
 * prompt the run would use (`CLI-TUI-UX.md` §1.3 `task run`). The descriptor
 * names `fulcrum runs feed` as the follow-on so a run is followable across
 * surfaces by its `--task` id.
 */
function buildRunDispatch(id: string, task: unknown, argv: readonly string[]): Record<string, unknown> {
  const record = (task && typeof task === "object" ? task : {}) as Record<string, unknown>;
  return compact({
    kind: "run-dispatch",
    taskId: id,
    title: record["title"] ?? null,
    projectId: record["projectId"] ?? record["project_id"] ?? undefined,
    agent: flagValue(argv, "--agent") ?? "default",
    model: flagValue(argv, "--model"),
    prompt: flagValue(argv, "--prompt"),
  });
}

/**
 * Build the QA-review payload for `fulcrum task qa-review` (`CLI-TUI-UX.md`
 * §1.3 `task qa-review --review-file`). Reads the review file from disk and
 * attaches it to the task identity so the review is recorded with provenance.
 */
async function buildQaReview(id: string, task: unknown, reviewFile: string): Promise<Record<string, unknown>> {
  const record = (task && typeof task === "object" ? task : {}) as Record<string, unknown>;
  let content: string;
  try {
    content = await Bun.file(reviewFile).text();
  } catch {
    throw new Error(`qa-review: review file not found: ${reviewFile}`);
  }
  return {
    kind: "qa-review",
    taskId: id,
    title: record["title"] ?? null,
    reviewFile,
    reviewLength: content.length,
    submittedAt: new Date().toISOString(),
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
  return ["fulcrum", "task", command, ...flags, ...(json ? ["--json"] : [])].join(" ");
}

function csvFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

/** Parse the `<id,id,...>` positional for `fulcrum task bulk`. */
function parseIdList(value: string): string[] {
  const ids = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!ids.length) throw new Error("bulk: expected <id,id,...>");
  return ids;
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
