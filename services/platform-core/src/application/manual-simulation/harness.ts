import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ManualSimulationWorkspace {
  id: string;
  rootDir: string;
  homeDir: string;
  evidenceDir: string;
  logsDir: string;
  snapshotsDir: string;
  cleanup(): Promise<void>;
}

export interface FakeApiRequest {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

export interface FakeApiServer {
  url: string;
  requests: readonly FakeApiRequest[];
  stop(force?: boolean): void;
}

export interface CliSimulationResult {
  argv: readonly string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  evidencePath: string;
}

export interface TerminalScriptTarget {
  mount(): Promise<void>;
  stop(): void;
}

export interface ScriptedTerminal {
  inject(key: string): void;
  plainText(): string;
  clear(): void;
}

export interface TuiSimulationResult {
  label: string;
  snapshots: readonly { key: string; text: string }[];
  evidencePath: string;
}

export interface RealTerminalSmokeCase {
  name: string;
  argv: readonly string[];
  expectedText: readonly string[];
  evidenceKind: "terminal-log" | "screenshot";
}

export interface CrossSurfaceJourneyStep {
  surface: "cli" | "tui" | "public-api";
  cliCommand?: readonly string[];
  tuiKeys?: readonly string[];
  expectedPersistedState: readonly string[];
  evidenceArtifacts: readonly string[];
}

export interface CrossSurfaceJourney {
  id: string;
  title: string;
  projectId: string;
  traceId: string;
  steps: readonly CrossSurfaceJourneyStep[];
}

export interface ManualSimulationEvidence {
  schema: "fulcrum.manual-simulation.v1";
  id: string;
  tempHome: string;
  fakeApiUrl?: string;
  cli: readonly CliSimulationResult[];
  tui: readonly TuiSimulationResult[];
  realTerminal: readonly RealTerminalSmokeCase[];
  journeys: readonly CrossSurfaceJourney[];
  artifacts: readonly string[];
}

export const DEFAULT_REAL_TERMINAL_SMOKE_CASES = [
  {
    name: "launcher-opens-and-exits",
    argv: ["tui"],
    expectedText: ["Domain nav", "Status footer"],
    evidenceKind: "terminal-log",
  },
  {
    name: "help-mode-renders",
    argv: ["tui", "--smoke", "help"],
    expectedText: ["Help", "Command palette"],
    evidenceKind: "terminal-log",
  },
] as const satisfies readonly RealTerminalSmokeCase[];

export const DEFAULT_CROSS_SURFACE_JOURNEYS = [
  {
    id: "pm-only-planning",
    title: "PM-only project and task planning",
    projectId: "project-e2e",
    traceId: "trace-pm-only",
    steps: [
      {
        surface: "cli",
        cliCommand: ["fulcrum", "product", "projects", "create", "--name", "Manual E2E", "--json"],
        expectedPersistedState: ["project:project-e2e", "trace:trace-pm-only"],
        evidenceArtifacts: ["logs/project-create.json"],
      },
      {
        surface: "cli",
        cliCommand: ["fulcrum", "product", "tasks", "create", "--project", "project-e2e", "--title", "Plan release", "--json"],
        expectedPersistedState: ["task:task-plan", "project:project-e2e", "trace:trace-pm-only"],
        evidenceArtifacts: ["logs/task-create.json"],
      },
      {
        surface: "tui",
        tuiKeys: ["j", "Enter"],
        expectedPersistedState: ["visible-task:task-plan", "project:project-e2e"],
        evidenceArtifacts: ["snapshots/task-list.json"],
      },
    ],
  },
  {
    id: "agent-run-supervision",
    title: "Agent run dispatch, watch, and artifact capture",
    projectId: "project-e2e",
    traceId: "trace-agent-run",
    steps: [
      {
        surface: "cli",
        cliCommand: ["fulcrum", "runs", "dispatch", "--task", "task-plan", "--agent", "codex", "--json"],
        expectedPersistedState: ["run:run-agent", "task:task-plan", "trace:trace-agent-run"],
        evidenceArtifacts: ["logs/run-dispatch.json"],
      },
      {
        surface: "cli",
        cliCommand: ["fulcrum", "runs", "watch", "run-agent", "--json"],
        expectedPersistedState: ["run:run-agent", "artifact:summary.md", "trace:trace-agent-run"],
        evidenceArtifacts: ["logs/run-watch.json"],
      },
      {
        surface: "tui",
        tuiKeys: ["j", "j", "Enter"],
        expectedPersistedState: ["visible-run:run-agent", "project:project-e2e"],
        evidenceArtifacts: ["snapshots/run-detail.json"],
      },
    ],
  },
  {
    id: "docs-context-handoff",
    title: "Docs search, context assembly, and planning handoff",
    projectId: "project-e2e",
    traceId: "trace-docs-context",
    steps: [
      {
        surface: "cli",
        cliCommand: ["fulcrum", "search", "context", "add", "--ids", "doc-architecture,task-plan", "--project", "project-e2e", "--json"],
        expectedPersistedState: ["context:doc-architecture", "context:task-plan", "trace:trace-docs-context"],
        evidenceArtifacts: ["logs/search-context-add.json"],
      },
      {
        surface: "tui",
        tuiKeys: ["/", "d", "Enter"],
        expectedPersistedState: ["visible-doc:doc-architecture", "project:project-e2e"],
        evidenceArtifacts: ["snapshots/docs-context.json"],
      },
      {
        surface: "public-api",
        expectedPersistedState: ["context.sourceRefs:doc-architecture", "context.projectId:project-e2e"],
        evidenceArtifacts: ["api/context-read.json"],
      },
    ],
  },
  {
    id: "review-uat-final-qa",
    title: "Review, UAT handoff, and final QA decision",
    projectId: "project-e2e",
    traceId: "trace-review-uat",
    steps: [
      {
        surface: "cli",
        cliCommand: ["fulcrum", "product", "reports", "uat-handoff", "--project", "project-e2e", "--trace", "trace-review-uat", "--json"],
        expectedPersistedState: ["uat:handoff", "project:project-e2e", "trace:trace-review-uat"],
        evidenceArtifacts: ["logs/uat-handoff.json"],
      },
      {
        surface: "cli",
        cliCommand: ["fulcrum", "product", "reports", "final-qa", "--project", "project-e2e", "--trace", "trace-review-uat", "--json"],
        expectedPersistedState: ["qa:accepted", "evidence:manual-simulation", "trace:trace-review-uat"],
        evidenceArtifacts: ["logs/final-qa.json"],
      },
      {
        surface: "tui",
        tuiKeys: ["/", "r", "Enter"],
        expectedPersistedState: ["visible-review:trace-review-uat", "project:project-e2e"],
        evidenceArtifacts: ["snapshots/review-uat.json"],
      },
    ],
  },
  {
    id: "integration-notification-loop",
    title: "Integration event, notification, and operator acknowledgement",
    projectId: "project-e2e",
    traceId: "trace-integration-notify",
    steps: [
      {
        surface: "cli",
        cliCommand: ["fulcrum", "notify", "list", "--unread", "--watch", "--json"],
        expectedPersistedState: ["notification:integration-event", "project:project-e2e", "trace:trace-integration-notify"],
        evidenceArtifacts: ["logs/notify-watch.json"],
      },
      {
        surface: "tui",
        tuiKeys: ["/", "n", "Enter", "R"],
        expectedPersistedState: ["notification:integration-event:read", "project:project-e2e"],
        evidenceArtifacts: ["snapshots/notification-read.json"],
      },
      {
        surface: "public-api",
        expectedPersistedState: ["notification.read:true", "trace:trace-integration-notify"],
        evidenceArtifacts: ["api/notification-state.json"],
      },
    ],
  },
] as const satisfies readonly CrossSurfaceJourney[];

export async function createManualSimulationWorkspace(id: string): Promise<ManualSimulationWorkspace> {
  const rootDir = await mkdtemp(join(tmpdir(), `fulcrum-manual-${id}-`));
  const homeDir = join(rootDir, "home");
  const evidenceDir = join(rootDir, "evidence");
  const logsDir = join(evidenceDir, "logs");
  const snapshotsDir = join(evidenceDir, "snapshots");
  await Promise.all([
    mkdir(homeDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
    mkdir(snapshotsDir, { recursive: true }),
  ]);
  return {
    id,
    rootDir,
    homeDir,
    evidenceDir,
    logsDir,
    snapshotsDir,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  };
}

export function startFakeJsonApi(
  handler: (request: Request) => Response | Promise<Response> = () => Response.json([]),
): FakeApiServer {
  const requests: FakeApiRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const rawBody = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
      requests.push({
        method: request.method,
        path: url.pathname,
        query: url.search,
        body: parseBody(rawBody),
      });
      return await handler(request);
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: (force?: boolean) => server.stop(force),
  };
}

export async function runCliSimulation(input: {
  workspace: ManualSimulationWorkspace;
  argv: readonly string[];
  api?: FakeApiServer;
  cwd?: string;
  env?: Record<string, string | undefined>;
}): Promise<CliSimulationResult> {
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", ...input.argv], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: input.workspace.homeDir,
      FULCRUM_SERVER_URL: input.api?.url,
      FULCRUM_FEATURES: "trpc-permission-local-dev-bypass",
      FULCRUM_ORG_ID: "11111111-1111-4111-8111-111111111111",
      FULCRUM_USER_ID: "22222222-2222-4222-8222-222222222222",
      FULCRUM_API_TOKEN: "manual-simulation-token",
      ...input.env,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const evidencePath = join(input.workspace.logsDir, `${safeName(input.argv.join(" ") || "help")}.json`);
  const result = { argv: [...input.argv], stdout, stderr, exitCode, evidencePath };
  await writeFile(evidencePath, JSON.stringify(result, null, 2));
  return result;
}

export async function runTuiSimulation(input: {
  workspace: ManualSimulationWorkspace;
  label: string;
  app: TerminalScriptTarget;
  terminal: ScriptedTerminal;
  keys: readonly string[];
}): Promise<TuiSimulationResult> {
  await input.app.mount();
  const snapshots: Array<{ key: string; text: string }> = [{
    key: "mount",
    text: input.terminal.plainText(),
  }];
  for (const key of input.keys) {
    input.terminal.clear();
    input.terminal.inject(key);
    await tick();
    snapshots.push({ key: printableKey(key), text: input.terminal.plainText() });
  }
  input.app.stop();
  const evidencePath = join(input.workspace.snapshotsDir, `${safeName(input.label)}.json`);
  const result = { label: input.label, snapshots, evidencePath };
  await writeFile(evidencePath, JSON.stringify(result, null, 2));
  return result;
}

export async function writeManualSimulationEvidence(input: {
  workspace: ManualSimulationWorkspace;
  api?: FakeApiServer;
  cli?: readonly CliSimulationResult[];
  tui?: readonly TuiSimulationResult[];
  realTerminal?: readonly RealTerminalSmokeCase[];
  journeys?: readonly CrossSurfaceJourney[];
}): Promise<string> {
  const cli = input.cli ?? [];
  const tui = input.tui ?? [];
  const realTerminal = input.realTerminal ?? [];
  const journeys = input.journeys ?? [];
  const evidence: ManualSimulationEvidence = {
    schema: "fulcrum.manual-simulation.v1",
    id: input.workspace.id,
    tempHome: input.workspace.homeDir,
    ...(input.api ? { fakeApiUrl: input.api.url } : {}),
    cli,
    tui,
    realTerminal,
    journeys,
    artifacts: [
      ...cli.map((result) => result.evidencePath),
      ...tui.map((result) => result.evidencePath),
      ...journeys.flatMap((journey) => journey.steps.flatMap((step) => step.evidenceArtifacts)),
    ],
  };
  const path = join(input.workspace.evidenceDir, "manual-simulation.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  return path;
}

export async function readManualSimulationEvidence(path: string): Promise<ManualSimulationEvidence> {
  return JSON.parse(await readFile(path, "utf8")) as ManualSimulationEvidence;
}

function parseBody(rawBody: string | null): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "simulation";
}

function printableKey(key: string): string {
  if (key === "\r") return "Enter";
  if (key === "\x1b") return "Escape";
  if (key === "\x0b") return "Ctrl+K";
  return key;
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
