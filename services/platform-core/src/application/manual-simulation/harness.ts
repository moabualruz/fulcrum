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

export interface ManualSimulationEvidence {
  schema: "fulcrum.manual-simulation.v1";
  id: string;
  tempHome: string;
  fakeApiUrl?: string;
  cli: readonly CliSimulationResult[];
  tui: readonly TuiSimulationResult[];
  realTerminal: readonly RealTerminalSmokeCase[];
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
}): Promise<string> {
  const cli = input.cli ?? [];
  const tui = input.tui ?? [];
  const realTerminal = input.realTerminal ?? [];
  const evidence: ManualSimulationEvidence = {
    schema: "fulcrum.manual-simulation.v1",
    id: input.workspace.id,
    tempHome: input.workspace.homeDir,
    ...(input.api ? { fakeApiUrl: input.api.url } : {}),
    cli,
    tui,
    realTerminal,
    artifacts: [
      ...cli.map((result) => result.evidencePath),
      ...tui.map((result) => result.evidencePath),
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
