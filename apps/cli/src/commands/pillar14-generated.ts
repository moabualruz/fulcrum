import { writeFile, readFile, stat as fsStat } from "node:fs/promises";
import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "../local-caller.ts";

export type Pillar14Domain = "runs" | "notify" | "audit" | "webhooks" | "connectors" | "flags";

export interface Pillar14RunOptions {
  caller?: any;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

type Io = Required<Pick<Pillar14RunOptions, "print" | "printErr" | "exit">>;

const HELP: Record<Pillar14Domain, string> = {
  runs: "fulcrum runs <list|show|cancel|retry|logs|attach> [--json]",
  notify: "fulcrum notify <list|mark-read|mark-all-read|mute|watch> [--unread] [--json]",
  audit: "fulcrum audit <query|export|retention> [--json]",
  webhooks: "fulcrum webhooks <list|test> [--json]",
  connectors: "fulcrum connectors <enable|sync> <id> [--json]",
  flags: "fulcrum flags <list|set> [--json]",
};

export async function runPillar14Command(
  domain: Pillar14Domain,
  argv: readonly string[],
  opts: Pillar14RunOptions = {},
): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [sub = "help", ...rest] = argv;

  if (sub === "help" || sub === "--help" || sub === "-h") {
    io.print(HELP[domain]);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    switch (domain) {
      case "runs":
        await runRuns(sub, rest, caller, io);
        return;
      case "notify":
        await runNotify(sub, rest, caller, io);
        return;
      case "audit":
        await runAudit(sub, rest, caller, io);
        return;
      case "webhooks":
        await runWebhooks(sub, rest, caller, io);
        return;
      case "connectors":
        await runConnectors(sub, rest, caller, io);
        return;
      case "flags":
        await runFlags(sub, rest, caller, io);
        return;
    }
  } catch (error) {
    emitError(error, hasFlag(argv, "--json"), io);
  }
}

async function runRuns(sub: string, argv: readonly string[], caller: any, io: Io) {
  const runsCaller = caller.agent_runs ?? caller.runs;
  if (sub === "list") {
    const status = optionValue(argv, "--status");
    const result = await runsCaller.list(status ? { status } : undefined);
    emitJson(result, io);
    return;
  }
  if (sub === "show") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs show: missing run id");
    const run = await runsCaller.get({ id });
    if (!run) {
      emitError(new Error(`run '${id}' not found`), hasFlag(argv, "--json"), io);
      return;
    }
    emitJson(run, io);
    return;
  }
  if (sub === "cancel") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs cancel: missing run id");
    emitJson(await runsCaller.cancel({ id }), io);
    return;
  }
  if (sub === "retry") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs retry: missing run id");
    emitJson(await runsCaller.retry({ id }), io);
    return;
  }
  if (sub === "logs") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs logs: missing run id");
    const follow = hasFlag(argv, "--follow");
    await streamRunLogs(id, follow, caller, io);
    return;
  }
  if (sub === "attach") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs attach: missing run id");
    await streamRunLogs(id, true, caller, io);
    return;
  }
  unknown("runs", sub, io);
}

/**
 * Stream JSONL log file for a run. In follow mode, watches for new lines
 * using stat-based polling until the run completes.
 */
async function streamRunLogs(
  runId: string,
  follow: boolean,
  caller: any,
  io: Io,
): Promise<void> {
  const run = await caller.runs.get({ id: runId });
  if (!run) {
    emitError(new Error(`run '${runId}' not found`), false, io);
    return;
  }

  const logPath = resolveLogPath(run);
  if (!logPath) {
    emitError(new Error(`no log file for run '${runId}'`), false, io);
    return;
  }

  // Read existing lines
  let bytesRead = 0;
  try {
    const content = await readFile(logPath, "utf8");
    bytesRead = Buffer.byteLength(content, "utf8");
    for (const line of content.split("\n")) {
      if (line.trim()) io.print(line);
    }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      if (!follow) {
        emitError(new Error(`log file not found: ${logPath}`), false, io);
        return;
      }
    } else {
      throw err;
    }
  }

  if (!follow) return;

  // Tail: stat-based poll every 500ms
  const POLL_MS = 500;
  const MAX_WAIT_MS = 300_000; // 5 min max follow
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const current = await caller.runs.get({ id: runId });
    const done = !current || ["succeeded", "failed", "cancelled"].includes(current.symphony_state ?? current.status ?? "");

    try {
      const st = await fsStat(logPath);
      if (st.size > bytesRead) {
        const fd = Bun.file(logPath);
        const tail = await fd.slice(bytesRead, st.size).text();
        bytesRead = st.size;
        for (const line of tail.split("\n")) {
          if (line.trim()) io.print(line);
        }
      }
    } catch {
      // File not yet created or disappeared
    }

    if (done) break;
  }
}

function resolveLogPath(run: Record<string, unknown>): string | null {
  const candidates = [
    run["transcript_path"],
    run["log_path"],
    (run["payload"] as Record<string, unknown> | undefined)?.["logPath"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

async function runNotify(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    const input = { unread: hasFlag(argv, "--unread") || undefined };
    if (hasFlag(argv, "--watch")) {
      for await (const event of caller.notify.watch(input)) {
        emitJson(event, io);
      }
      return;
    }
    emitJson(await safeListNotifications(caller, input), io);
    return;
  }

  if (sub === "watch") {
    const input = { unread: hasFlag(argv, "--unread") || undefined };
    for await (const event of caller.notify.watch(input)) {
      emitJson(event, io);
    }
    return;
  }

  if (sub === "mark-read") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "notify mark-read: missing --id");
    emitJson(await caller.notify.markRead({ id }), io);
    return;
  }

  if (sub === "mark-all-read") {
    emitJson(await caller.notify.markAllRead(), io);
    return;
  }

  if (sub === "mute") {
    const subjectKind = optionValue(argv, "--subject-kind") ?? positional(argv)[0];
    const subjectId = optionValue(argv, "--subject-id") ?? positional(argv)[1];
    requireValue(subjectKind, "notify mute: missing --subject-kind");
    requireValue(subjectId, "notify mute: missing --subject-id");
    const mutedUntilRaw = optionValue(argv, "--muted-until");
    emitJson(await caller.notify.mute({
      subjectKind,
      subjectId,
      mutedUntil: mutedUntilRaw ? new Date(mutedUntilRaw) : undefined,
    }), io);
    return;
  }

  unknown("notify", sub, io);
}

async function safeListNotifications(caller: any, input: Record<string, unknown>): Promise<unknown> {
  try {
    return await caller.notify.list(input);
  } catch (error) {
    if ((error as Error).message?.includes("Metadata for entity Notification not found")) {
      return [];
    }
    throw error;
  }
}

async function runAudit(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "query") {
    const result = await caller.audit.query({
      kind: optionValue(argv, "--kind"),
      subjectKind: optionValue(argv, "--kind"),
      since: dateOption(argv, "--since"),
      dateRange: dateOption(argv, "--since") ? { from: dateOption(argv, "--since") } : undefined,
    });
    emitJson(normalizeAuditResult(result), io);
    return;
  }
  if (sub === "export") {
    const format = optionValue(argv, "--format") ?? "json";
    const output = optionValue(argv, "--output");
    requireValue(output, "audit export: missing --output");
    const result = await caller.audit.export({ format });
    if (format === "csv") {
      const csv = typeof result === "string" ? result : result.csv;
      await writeFile(output, csv.endsWith("\n") ? csv : `${csv}\n`);
      return;
    }
    const rows = normalizeAuditResult(result);
    await writeFile(output, `${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  if (sub === "retention") {
    const [action] = positional(argv);
    if (action !== "set") return unknown("audit", "retention", io);
    const daysRaw = optionValue(argv, "--days");
    requireValue(daysRaw, "audit retention set: missing --days");
    const retainDays = Number.parseInt(daysRaw, 10);
    if (!Number.isFinite(retainDays) || retainDays < 0) throw new Error("audit retention set: --days must be >= 0");
    emitJson(await caller.audit.retentionPolicy.set({ retainDays }), io);
    return;
  }
  unknown("audit", sub, io);
}

async function runWebhooks(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    emitJson(await caller.webhooks.list(), io);
    return;
  }
  if (sub === "test") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "webhooks test: missing webhook id");
    emitJson(await caller.webhooks.test({ id }), io);
    return;
  }
  unknown("webhooks", sub, io);
}

async function runConnectors(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "enable") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "connectors enable: missing connector id");
    emitJson(await caller.connectors.enable({ id }), io);
    return;
  }
  if (sub === "sync") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "connectors sync: missing connector id");
    emitJson(await caller.connectors.sync({ id }), io);
    return;
  }
  unknown("connectors", sub, io);
}

async function runFlags(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    emitJson(await caller.flags.list(), io);
    return;
  }
  if (sub === "set") {
    const [flag, value] = positional(argv);
    requireValue(flag, "flags set: missing flag");
    requireValue(value, "flags set: missing on/off value");
    if (value !== "on" && value !== "off") throw new Error("flags set: value must be on or off");
    emitJson(await caller.flags.set({ flag, enabled: value === "on" }), io);
    return;
  }
  unknown("flags", sub, io);
}

function emitJson(value: unknown, io: Io): void {
  io.print(JSON.stringify(value));
}

function emitError(error: unknown, jsonMode: boolean, io: Io): void {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (jsonMode) {
    io.print(JSON.stringify({ error: { code, message } }));
  } else {
    io.printErr(message);
  }
  io.exit(1);
}

function errorCode(error: unknown): string {
  if (error instanceof TRPCError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "INTERNAL_ERROR";
}

function unknown(domain: Pillar14Domain, sub: string, io: Io): void {
  io.printErr(`fulcrum ${domain}: unknown command '${sub}'`);
  io.exit(2);
}

function requireValue<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined || value === "") throw new Error(message);
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function optionValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function positional(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--json" || arg === "--watch" || arg === "--unread") continue;
    if (arg.startsWith("--")) {
      i += 1;
      continue;
    }
    values.push(arg);
  }
  return values;
}

function dateOption(argv: readonly string[], flag: string): Date | undefined {
  const value = optionValue(argv, flag);
  return value ? new Date(value) : undefined;
}

function normalizeAuditResult(result: any): unknown {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.rows)) return result.rows;
  return result;
}

async function resolveCaller(opts: Pillar14RunOptions): Promise<any> {
  if (opts.caller) return opts.caller;

  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as any;
}
