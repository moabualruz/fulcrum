/**
 * fulcrum symphony: CLI surface for orchestration commands (P3#19).
 *
 * All business logic delegated via SymphonyCaller interface.
 * --json flag on every command emits machine-readable output.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DispatchResult {
  runId: string;
  state: string;
  agent: string;
  sandboxMode: string;
  transcriptPath?: string | null;
  artifactCount?: number;
}

export interface SymphonyCaller {
  getOrchestratorStatus: () => Promise<{ running: number; queued: number; stalled: number }>;
  listRuns: (input: { state?: string; projectId?: string; limit?: number }) => Promise<RunRow[]>;
  getRun: (input: { runId: string }) => Promise<RunDetail | null>;
  cancelRun: (input: { runId: string }) => Promise<{ success: boolean }>;
  retryRun: (input: { runId: string }) => Promise<{ success: boolean }>;
  syncDaily: () => Promise<{ synced: number; errors: number }>;
  dispatchRun: (input: {
    taskId: string;
    agentName?: string;
    workflowPath?: string;
    sandboxMode?: string;
  }) => Promise<DispatchResult>;
}

export interface RunRow {
  id: string;
  state: string;
  attemptCount?: number;
  startedAt?: string;
}

export interface RunDetail {
  id: string;
  state?: string | null;
  orchestrationState?: string | null;
  attemptCount?: number | null;
  nextRetryAt?: Date | string | null;
  lastErrorKind?: string | null;
  workspacePath?: string | null;
  renderedPrompt?: string | null;
}

export interface ConformanceResult {
  sections: Array<{ section: string; pass: boolean; reason?: string }>;
  pass: boolean;
}

export interface SymphonyRunOptions {
  caller: SymphonyCaller;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  runConformanceCheck?: () => Promise<ConformanceResult>;
}

/* ------------------------------------------------------------------ */
/* Help                                                                */
/* ------------------------------------------------------------------ */

const HELP = `fulcrum symphony: orchestration CLI

Usage:
  fulcrum symphony status [--json]
  fulcrum symphony sync [--daily] [--json]
  fulcrum symphony runs list [--project <id>] [--state <state>] [--json]
  fulcrum symphony runs show <runId> [--json] [--verbose]
  fulcrum symphony runs cancel <runId> [--json]
  fulcrum symphony runs retry <runId> [--json]
  fulcrum symphony runs dispatch <taskId> [--agent <name>] [--workflow <path>] [--sandbox <mode>] [--json]
  fulcrum symphony conformance [--verbose] [--json]

Options:
  --json     Machine-readable JSON output.
  --verbose  Include extra detail (rendered prompt, per-section reasons).
  -h, --help Show this help.
`;

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

export async function run(
  argv: readonly string[],
  opts: SymphonyRunOptions,
): Promise<void> {
  const {
    print = console.log,
    printErr = console.error,
    exit = process.exit,
  } = opts;
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "status":
      return cmdStatus(rest, { ...opts, print, printErr, exit });
    case "sync":
      return cmdSync(rest, { ...opts, print, printErr, exit });
    case "runs":
      return cmdRuns(rest, { ...opts, print, printErr, exit });
    case "conformance":
      return cmdConformance(rest, { ...opts, print, printErr, exit });
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum symphony: unknown command '${cmd}'`);
      printErr(HELP);
      exit(2);
  }
}

/* ------------------------------------------------------------------ */
/* status                                                              */
/* ------------------------------------------------------------------ */

type ResolvedOpts = SymphonyRunOptions & Required<Pick<SymphonyRunOptions, "print" | "printErr" | "exit">>;

async function cmdStatus(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, caller } = opts;
  const json = argv.includes("--json");
  const status = await caller.getOrchestratorStatus();
  if (json) {
    print(JSON.stringify(status));
    return;
  }
  print("Symphony Orchestrator Status");
  print("─".repeat(30));
  print(`  Running: ${status.running}`);
  print(`  Queued:  ${status.queued}`);
  print(`  Stalled: ${status.stalled}`);
}

/* ------------------------------------------------------------------ */
/* sync                                                                */
/* ------------------------------------------------------------------ */

async function cmdSync(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, caller } = opts;
  const json = argv.includes("--json");
  const result = await caller.syncDaily();
  if (json) {
    print(JSON.stringify(result));
    return;
  }
  print(`Synced ${result.synced} items, ${result.errors} errors`);
}

/* ------------------------------------------------------------------ */
/* runs                                                                */
/* ------------------------------------------------------------------ */

async function cmdRuns(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit } = opts;
  const [action = "help", ...rest] = argv;

  switch (action) {
    case "list":
      return cmdRunsList(rest, opts);
    case "show":
      return cmdRunsShow(rest, opts);
    case "cancel":
      return cmdRunsCancel(rest, opts);
    case "retry":
      return cmdRunsRetry(rest, opts);
    case "dispatch":
      return cmdRunsDispatch(rest, opts);
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum symphony runs: unknown command '${action}'`);
      printErr(HELP);
      exit(2);
  }
}

async function cmdRunsList(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, caller } = opts;
  const json = argv.includes("--json");
  const state = readFlag(argv, "--state");
  const projectId = readFlag(argv, "--project");

  const rows = await caller.listRuns({ state: state ?? undefined, projectId: projectId ?? undefined });

  if (json) {
    print(JSON.stringify(rows));
    return;
  }

  print("ID                STATE         ATTEMPT  STARTED_AT");
  for (const r of rows) {
    print(
      `${r.id}  ${(r.state ?? "").padEnd(12)}  ${String(r.attemptCount ?? "").padEnd(7)}  ${r.startedAt ?? ""}`,
    );
  }
}

async function cmdRunsShow(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit, caller } = opts;
  const runId = argv.find((a) => !a.startsWith("-"));
  const json = argv.includes("--json");
  const verbose = argv.includes("--verbose");

  if (!runId) {
    printErr("fulcrum symphony runs show: missing <runId>");
    exit(2);
    return;
  }

  const row = await caller.getRun({ runId });
  if (!row) {
    printErr(`fulcrum symphony runs show: run not found '${runId}'`);
    exit(1);
    return;
  }

  if (json) {
    print(JSON.stringify(row));
    return;
  }

  print(`ID     ${row.id}`);
  print(`STATE  ${row.state ?? row.orchestrationState ?? ""}`);
  if (row.attemptCount != null) print(`ATTEMPT  ${row.attemptCount}`);
  if (row.nextRetryAt) {
    const ts = row.nextRetryAt instanceof Date ? row.nextRetryAt.toISOString() : row.nextRetryAt;
    print(`NEXT_RETRY_AT  ${ts}`);
  }
  if (row.lastErrorKind) print(`LAST_ERROR_KIND  ${row.lastErrorKind}`);
  if (row.workspacePath) print(`WORKSPACE  ${row.workspacePath}`);

  if (verbose && row.renderedPrompt) {
    print("");
    print("RENDERED PROMPT");
    print(excerpt(row.renderedPrompt));
  }
}

async function cmdRunsCancel(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit, caller } = opts;
  const runId = argv.find((a) => !a.startsWith("-"));
  const json = argv.includes("--json");

  if (!runId) {
    printErr("fulcrum symphony runs cancel: missing <runId>");
    exit(2);
    return;
  }

  const result = await caller.cancelRun({ runId });
  if (json) {
    print(JSON.stringify(result));
    return;
  }
  print(result.success ? `Cancelled run ${runId}` : `Failed to cancel run ${runId}`);
}

async function cmdRunsRetry(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit, caller } = opts;
  const runId = argv.find((a) => !a.startsWith("-"));
  const json = argv.includes("--json");

  if (!runId) {
    printErr("fulcrum symphony runs retry: missing <runId>");
    exit(2);
    return;
  }

  const result = await caller.retryRun({ runId });
  if (json) {
    print(JSON.stringify(result));
    return;
  }
  print(result.success ? `Retrying run ${runId}` : `Failed to retry run ${runId}`);
}

async function cmdRunsDispatch(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit, caller } = opts;
  const taskId = argv.find((a) => !a.startsWith("-"));
  const json = argv.includes("--json");
  const agentName = readFlag(argv, "--agent") ?? undefined;
  const workflowPath = readFlag(argv, "--workflow") ?? undefined;
  const sandboxMode = readFlag(argv, "--sandbox") ?? undefined;

  if (!taskId) {
    printErr("fulcrum symphony runs dispatch: missing <taskId>");
    exit(2);
    return;
  }

  const result = await caller.dispatchRun({ taskId, agentName, workflowPath, sandboxMode });

  if (json) {
    print(JSON.stringify(result));
    return;
  }

  print(`Dispatched run ${result.runId}`);
  print(`  State:    ${result.state}`);
  print(`  Agent:    ${result.agent}`);
  print(`  Sandbox:  ${result.sandboxMode}`);
}

/* ------------------------------------------------------------------ */
/* conformance                                                         */
/* ------------------------------------------------------------------ */

async function cmdConformance(argv: readonly string[], opts: ResolvedOpts): Promise<void> {
  const { print, printErr, exit } = opts;
  const json = argv.includes("--json");
  const verbose = argv.includes("--verbose");

  const checker = opts.runConformanceCheck ?? defaultConformanceCheck;
  const result = await checker();

  if (json) {
    print(JSON.stringify(result));
    return;
  }

  for (const s of result.sections) {
    const tag = s.pass ? "PASS" : "FAIL";
    const reason = verbose && s.reason ? `: ${s.reason}` : "";
    print(`${tag}  ${s.section}${reason}`);
  }

  if (!result.pass) {
    printErr("conformance: FAIL");
    exit(1);
  }
}

async function defaultConformanceCheck(): Promise<ConformanceResult> {
  // Default: run `bun test` subprocess and parse output.
  // Placeholder: real implementation parses SPEC.md sections.
  return { sections: [], pass: true };
}

/* ------------------------------------------------------------------ */
/* utils                                                               */
/* ------------------------------------------------------------------ */

function readFlag(argv: readonly string[], flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return null;
  return argv[idx + 1] as string;
}

/** Stub caller for CLI bootstrap: returns empty/placeholder data. */
export function stubCaller(): SymphonyCaller {
  return {
    getOrchestratorStatus: async () => ({ running: 0, queued: 0, stalled: 0 }),
    listRuns: async () => [],
    getRun: async () => null,
    cancelRun: async () => ({ success: false }),
    retryRun: async () => ({ success: false }),
    syncDaily: async () => ({ synced: 0, errors: 0 }),
    dispatchRun: async () => ({ runId: "", state: "unclaimed", agent: "codex", sandboxMode: "noSandbox" }),
  };
}

function excerpt(value: string, maxChars = 240): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3)}...`;
}
