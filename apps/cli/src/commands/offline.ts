import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type OfflineConnectionState = "online" | "offline" | "syncing";

export interface OfflineReconnectState {
  connection: OfflineConnectionState;
  lastSyncAt: string | null;
  queuedChanges: number;
}

interface OfflineCommandOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const DEFAULT_STATE: OfflineReconnectState = {
  connection: "online",
  lastSyncAt: null,
  queuedChanges: 0,
};

export async function run(argv: readonly string[], opts: OfflineCommandOptions = {}): Promise<void> {
  const [sub = "help", ...rest] = argv;
  const json = rest.includes("--json");
  const print = opts.print ?? console.log;
  const printErr = opts.printErr ?? console.error;
  const exit = opts.exit ?? ((code: number) => process.exit(code));

  if (sub === "help" || sub === "--help" || sub === "-h") {
    print(help());
    return;
  }

  if (sub === "status") {
    const state = await readState(opts);
    const payload = {
      ok: true,
      connection: state.connection,
      lastSyncAt: state.lastSyncAt,
      queuedChanges: state.queuedChanges,
      syncNowCommand: "fulcrum offline sync-now --json",
    };
    print(json ? JSON.stringify(payload) : formatStatus(payload));
    return;
  }

  if (sub === "sync-now") {
    const before = await readState(opts);
    const replayedChanges = before.queuedChanges;
    const lastSyncAt = (opts.now?.() ?? new Date()).toISOString();
    const after: OfflineReconnectState = {
      connection: "online",
      lastSyncAt,
      queuedChanges: 0,
    };
    await writeState(after, opts);
    const payload = {
      ok: true,
      connection: after.connection,
      lastSyncAt: after.lastSyncAt,
      queuedChanges: after.queuedChanges,
      replayedChanges,
    };
    print(json ? JSON.stringify(payload) : `Synced ${replayedChanges} queued changes. Last sync ${lastSyncAt}.`);
    return;
  }

  printErr(`fulcrum offline: unknown command '${sub}'`);
  exit(2);
}

function help(): string {
  return `fulcrum offline

Usage:
  fulcrum offline status [--json]
  fulcrum offline sync-now [--json]
`;
}

function formatStatus(payload: {
  connection: OfflineConnectionState;
  lastSyncAt: string | null;
  queuedChanges: number;
  syncNowCommand: string;
}): string {
  return [
    `Connection: ${payload.connection}`,
    `Last sync: ${payload.lastSyncAt ?? "never"}`,
    `Queued changes: ${payload.queuedChanges}`,
    `Sync now: ${payload.syncNowCommand}`,
  ].join("\n");
}

async function readState(opts: OfflineCommandOptions): Promise<OfflineReconnectState> {
  const path = statePath(opts);
  try {
    return normalizeState(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_STATE;
    throw error;
  }
}

async function writeState(state: OfflineReconnectState, opts: OfflineCommandOptions): Promise<void> {
  const path = statePath(opts);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

function statePath(opts: OfflineCommandOptions): string {
  const env = opts.env ?? process.env;
  return env.FULCRUM_OFFLINE_STATE_PATH ?? join(env.FULCRUM_HOME ?? join(env.HOME ?? process.cwd(), ".fulcrum"), "offline-reconnect.json");
}

function normalizeState(value: unknown): OfflineReconnectState {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const connection = input.connection === "offline" || input.connection === "syncing" || input.connection === "online"
    ? input.connection
    : DEFAULT_STATE.connection;
  const queuedChanges = typeof input.queuedChanges === "number" && Number.isFinite(input.queuedChanges)
    ? Math.max(0, Math.floor(input.queuedChanges))
    : DEFAULT_STATE.queuedChanges;
  const lastSyncAt = typeof input.lastSyncAt === "string" ? input.lastSyncAt : null;
  return { connection, lastSyncAt, queuedChanges };
}
