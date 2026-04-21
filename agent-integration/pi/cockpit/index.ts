/**
 * Fulcrum Cockpit Extension
 *
 * Control-plane dashboard for the PI coding agent — and a shared backend
 * for Claude Code and Gemini CLI via the same monitor server.
 *
 *   Dashboard widget  — live runs, blockers, WIP, server status
 *   Footer status     — quick-glance counters at all times
 *   Setup wizard      — first-run prompt: workspace, project, port
 *   Slash commands    — task / run / memory / CoS operations
 *   LLM tools         — 11 native fulcrum_* tools (no MCP overhead)
 *   Policy hook       — every tool_call checked against Fulcrum policy engine
 *
 * Install (local):
 *   pi install ./agent-integration/pi/cockpit
 *
 * Install (git, whole repo):
 *   pi install git:github.com/<you>/pi-stack-plan
 *
 * Install (npm, once published):
 *   pi install npm:@fulcrum-agent-os/pi-cockpit
 *
 * Config — workspace_id / project_id are computed deterministically from the
 *   project directory path (sha256[:12] of abs path, prefixed with dir name).
 *   No files are written to your project directory.
 *
 * Env-var overrides: FULCRUM_WORKSPACE_ID  FULCRUM_PROJECT_ID  FULCRUM_PORT
 *
 * Other agents sharing this backend:
 *   Claude Code  → agent-integration/claude/  (.mcp.json, CLAUDE.md)
 *   Gemini CLI   → agent-integration/gemini/  (gemini-extension.json, GEMINI.md)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
const { spawn, spawnSync } = require("child_process") as typeof import("child_process");
const { createHash } = require("crypto") as typeof import("crypto");
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const _dirPath = path.dirname(fileURLToPath(import.meta.url));

// ── Types ──────────────────────────────────────────────────────────────────────

interface CockpitConfig {
  workspace_id: string;
  project_id: string;
  monitor_port: number;
}

interface AgentRunRow {
  run_id: string;
  role: string;
  status: string;
  heartbeat_at?: string;
  task_id?: string;
}

interface WorkspaceSnapshot {
  workspace_id: string;
  running_agents: AgentRunRow[];
  blocked_agents: AgentRunRow[];
  wip_count: number;
  ts: string;
}

// ── Config discovery ───────────────────────────────────────────────────────────
// workspace_id / project_id are computed deterministically from the project
// directory path — no .fulcrum.json file is written to or read from the project.

export function computeProjectIds(absPath: string): { workspace_id: string; project_id: string } {
  const hash = createHash("sha256").update(absPath).digest("hex").slice(0, 12);
  const sanitizedName = path.basename(absPath).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) || "project";
  return {
    workspace_id: `ws_${sanitizedName}_${hash}`,
    project_id: `proj_${sanitizedName}_${hash}`,
  };
}

export function loadCockpitConfig(cwd: string): CockpitConfig {
  const absPath = path.resolve(cwd);
  const { workspace_id: computedWs, project_id: computedProj } = computeProjectIds(absPath);
  return {
    workspace_id: process.env["FULCRUM_WORKSPACE_ID"] ?? computedWs,
    project_id: process.env["FULCRUM_PROJECT_ID"] ?? computedProj,
    monitor_port: parseInt(process.env["FULCRUM_PORT"] ?? "4721", 10),
  };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

async function apiGet<T>(baseUrl: string, urlPath: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${urlPath}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function apiPost<T>(baseUrl: string, urlPath: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: `HTTP ${res.status}: ${text}` } as T;
    }
    return await res.json() as T;
  } catch (e: unknown) {
    return { error: String(e) } as T;
  }
}

async function apiPatch<T>(baseUrl: string, urlPath: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export function responseList<T>(payload: unknown, legacyKey: string): T[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const legacy = record[legacyKey];
  if (Array.isArray(legacy)) return legacy as T[];
  const data = record["data"];
  return Array.isArray(data) ? data as T[] : [];
}

export function responseDataObject<T extends Record<string, unknown>>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record["data"];
  if (data && typeof data === "object" && !Array.isArray(data)) return data as T;
  return record as T;
}

export function buildFulcrumFirstNudge(workspaceId: string, runId?: string | null): string {
  const lines = [
    "[Fulcrum-first]",
    `Workspace: ${workspaceId}`,
    "Before file/code search or architecture decisions, prefer native PI tools `fulcrum_workspace_status` and `fulcrum_recall_memory`.",
    "After non-obvious decisions or outcomes, persist durable knowledge with `fulcrum_write_memory`.",
  ];
  if (runId) lines.splice(2, 0, `Run ID: ${runId}`);
  return lines.join("\n");
}

async function isServerUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";
const BOLD  = "\x1b[1m";

function rgb(r: number, g: number, b: number, s: string): string {
  return `\x1b[38;2;${r};${g};${b}m${s}${RESET}`;
}

const GREEN  = (s: string) => rgb(100, 220, 120, s);
const YELLOW = (s: string) => rgb(255, 210, 60, s);
const RED    = (s: string) => rgb(255, 80, 80, s);
const CYAN   = (s: string) => rgb(80, 200, 220, s);
const MUTED  = (s: string) => `${DIM}${s}${RESET}`;
const BOLD_S = (s: string) => `${BOLD}${s}${RESET}`;

// ── Fulcrum CLI helpers ────────────────────────────────────────────────────────

function isFulcrumInstalled(): boolean {
  const r = spawnSync("fulcrum", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function execAction(name: string, actionArgs?: Record<string, unknown>): unknown {
  const argv = ["action", "exec", name];
  if (actionArgs && Object.keys(actionArgs).length > 0) {
    argv.push("--json", JSON.stringify(actionArgs));
  }
  const r = spawnSync("fulcrum", argv, { encoding: "utf-8", timeout: 10_000 });
  if (r.error || r.status !== 0) {
    throw new Error((r.stderr as string)?.trim() || r.error?.message || `exit ${r.status}`);
  }
  try {
    return JSON.parse(r.stdout ?? "null");
  } catch {
    return (r.stdout as string)?.trim() ?? null;
  }
}

// ── Main extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let cfg: CockpitConfig = { workspace_id: "", project_id: "", monitor_port: 4721 };
  let baseUrl = "http://127.0.0.1:4721";
  let cwd = process.cwd();

  let serverProc: ReturnType<typeof spawn> | null = null;
  let serverState: "stopped" | "starting" | "up" | "error" = "stopped";
  let snapshot: WorkspaceSnapshot | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let uiRef: { setStatus: (id: string, s?: string) => void; notify: (msg: string, level: string) => void } | null = null;
  let currentRunId: string | null = null;
  // Active role — set via /fulcrum:role <slug>, appended to systemPrompt in
  // before_agent_start. PI has no native `pi agent switch` primitive; this is
  // the Fulcrum synthesis of a role-switching UX.
  let activeRole: string | null = null;
  let activeRoleBody: string | null = null;

  // ── Setup wizard ─────────────────────────────────────────────────────────────

  async function runSetupWizard(ctx: { ui: typeof uiRef & { input: (title: string, initial?: string) => Promise<string | null>; confirm: (title: string, msg: string) => Promise<boolean>; } }): Promise<CockpitConfig | null> {
    const ui = ctx.ui;

    ui.notify(
      "Fulcrum Cockpit — first-run setup\n" +
      "Workspace and project IDs are derived automatically from your project path.",
      "info",
    );

    // 1. Check fulcrum CLI
    if (!isFulcrumInstalled()) {
      ui.notify(
        "⚠ fulcrum CLI is not installed.\n" +
        "Run: npm install -g fulcrum-agent-cli\n" +
        "Or from repo: npm install && npm run build && npm link\n" +
        "Then reload with /reload",
        "error",
      );
      return null;
    }

    // 2. Compute IDs from CWD (deterministic, no file needed)
    const absPath = path.resolve(cwd);
    const computed = computeProjectIds(absPath);
    const workspace_id = process.env["FULCRUM_WORKSPACE_ID"] ?? computed.workspace_id;
    const project_id = process.env["FULCRUM_PROJECT_ID"] ?? computed.project_id;

    ui.notify(
      `Auto-computed IDs from path:\n  workspace: ${workspace_id}\n  project:   ${project_id}\n\nOverride with FULCRUM_WORKSPACE_ID / FULCRUM_PROJECT_ID env vars.`,
      "success",
    );

    // 3. port
    const portInput = await ui.input("Monitor port", "4721");
    if (portInput === null) return null;
    const monitor_port = parseInt(portInput.trim() || "4721", 10);

    const newCfg: CockpitConfig = { workspace_id, project_id, monitor_port };

    // Ensure workspace + project exist in the global DB via the CLI
    try {
      spawnSync("fulcrum", ["task", "list", "--workspace", workspace_id, "--limit", "1"], {
        encoding: "utf-8",
        stdio: "pipe",
      });
      ui.notify(`Workspace initialized: ${workspace_id}`, "success");
    } catch {
      // CLI will auto-init on next run — non-fatal
    }

    return newCfg;
  }

  // ── Server management ─────────────────────────────────────────────────────────

  async function startServer(): Promise<void> {
    if (await isServerUp(cfg.monitor_port)) {
      serverState = "up";
      updateStatus();
      return;
    }
    serverState = "starting";
    updateStatus();
    uiRef?.notify(`Starting Fulcrum monitor on :${cfg.monitor_port}…`, "info");

    const proc = spawn(
      "fulcrum",
      ["serve", "monitor", "--port", String(cfg.monitor_port)],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env }, detached: false },
    );
    serverProc = proc;

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      if (chunk.includes("Listening on")) {
        serverState = "up";
        updateStatus();
        uiRef?.notify(`Fulcrum ready — http://127.0.0.1:${cfg.monitor_port}`, "success");
        refreshStatus();
      }
    });

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      if (chunk.includes("Listening on")) {
        serverState = "up";
        updateStatus();
        uiRef?.notify(`Fulcrum ready — http://127.0.0.1:${cfg.monitor_port}`, "success");
        refreshStatus();
      }
    });

    proc.on("error", () => {
      serverState = "error";
      updateStatus();
      uiRef?.notify("Failed to start Fulcrum monitor — is fulcrum installed? (npm install -g fulcrum-agent-cli)", "error");
    });

    proc.on("close", (code: number | null) => {
      if (serverState !== "stopped") serverState = (code === 0 ? "stopped" : "error");
      serverProc = null;
      updateStatus();
    });

    // Poll up to 15 s for readiness
    let attempts = 0;
    const check = setInterval(async () => {
      attempts++;
      if (await isServerUp(cfg.monitor_port)) {
        serverState = "up";
        updateStatus();
        uiRef?.notify(`Fulcrum ready — http://127.0.0.1:${cfg.monitor_port}`, "success");
        refreshStatus();
        clearInterval(check);
      } else if (attempts >= 15) {
        clearInterval(check);
        if (serverState === "starting") {
          serverState = "error";
          updateStatus();
          uiRef?.notify("Fulcrum monitor did not start within 15 s", "error");
        }
      }
    }, 1000);
  }

  function stopServer(): void {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (serverProc) {
      serverState = "stopped";
      serverProc.kill("SIGTERM");
      serverProc = null;
    }
  }

  // ── Status polling ────────────────────────────────────────────────────────────

  async function refreshStatus(): Promise<void> {
    if (!cfg.workspace_id || serverState !== "up") return;

    const ws = encodeURIComponent(cfg.workspace_id);

    // Fetch agent runs + board counts in parallel
    const [agentsData, boardData] = await Promise.all([
      apiGet<{ data: AgentRunRow[] }>(baseUrl, `/agents?workspace_id=${ws}`),
      apiGet<{ data: Record<string, number> }>(baseUrl, `/board?workspace_id=${ws}`),
    ]);

    const allRuns = agentsData?.data ?? [];
    const running = allRuns.filter(r => r.status === "running");
    const blocked = allRuns.filter(r => r.status === "blocked");
    const wip = (boardData?.data?.["active"] ?? 0) + (boardData?.data?.["blocked"] ?? 0);

    snapshot = {
      workspace_id: cfg.workspace_id,
      running_agents: running,
      blocked_agents: blocked,
      wip_count: wip,
      ts: new Date().toISOString(),
    };
    updateStatus();
  }

  // ── Footer status line ────────────────────────────────────────────────────────

  function updateStatus(): void {
    if (!uiRef) return;
    const dot =
      serverState === "up"       ? GREEN("●") :
      serverState === "starting" ? YELLOW("◐") :
      serverState === "error"    ? RED("✗")   : MUTED("○");

    const r = snapshot?.running_agents?.length ?? 0;
    const b = snapshot?.blocked_agents?.length ?? 0;
    const w = snapshot?.wip_count ?? 0;

    const text =
      `${dot} ${BOLD_S(CYAN("FULCRUM"))}  ` +
      GREEN(`${r} run`) + "  " +
      (b > 0 ? RED(`${b} blocked`) + "  " : "") +
      MUTED(`WIP:${w}  :${cfg.monitor_port}`);

    uiRef.setStatus("fulcrum", text);
  }

  // ── Dashboard widget ──────────────────────────────────────────────────────────

  function registerWidget(ctx: { ui: { setWidget: (id: string, factory?: unknown) => void } }): void {
    ctx.ui.setWidget("fulcrum-cockpit", (_tui: unknown, _theme: unknown) => ({
      render(width: number): string[] {
        const maxW = Math.min(width - 2, 72);
        const sep = MUTED("─".repeat(maxW));

        const dot =
          serverState === "up"       ? GREEN("●") :
          serverState === "starting" ? YELLOW("◐") :
          serverState === "error"    ? RED("✗")   : MUTED("○");

        const header =
          `${BOLD_S(CYAN("Fulcrum"))}  ${dot}  ` +
          MUTED(`http://127.0.0.1:${cfg.monitor_port}`);

        const lines: string[] = [header, sep];

        if (!snapshot) {
          const msg =
            !cfg.workspace_id
              ? YELLOW("⚠  No workspace configured — type /fulcrum-setup")
              : serverState === "starting"
              ? MUTED("  Starting server…")
              : serverState === "error"
              ? RED("  Server failed — type /fulcrum-start to retry")
              : MUTED("  Polling…");
          lines.push(msg, sep);
          return lines;
        }

        const running = snapshot.running_agents ?? [];
        const blocked = snapshot.blocked_agents ?? [];
        const wip     = snapshot.wip_count ?? 0;

        // Summary row
        lines.push(
          GREEN(`● ${running.length} running`) +
          (blocked.length > 0 ? RED(`   ⚠ ${blocked.length} blocked`) : MUTED("   0 blocked")) +
          MUTED(`   WIP: ${wip}`)
        );
        lines.push(sep);

        // Running agents
        for (const run of running.slice(0, 5)) {
          const role = (run.role ?? "—").slice(0, 18).padEnd(18);
          lines.push(`  ${GREEN("●")} ${CYAN(role)} ${MUTED(run.run_id.slice(-8))}`);
        }

        // Blocked agents
        for (const run of blocked.slice(0, 3)) {
          const role = (run.role ?? "—").slice(0, 18).padEnd(18);
          lines.push(`  ${RED("⚠")} ${YELLOW(role)} ${MUTED(run.run_id.slice(-8))}`);
        }

        if (running.length === 0 && blocked.length === 0) {
          lines.push(MUTED("  No active agent runs"));
        }

        lines.push(sep);
        const wsTag   = cfg.workspace_id ? MUTED(`ws:${cfg.workspace_id.slice(-8)}`) : YELLOW("no workspace");
        const projTag = cfg.project_id   ? MUTED(`  proj:${cfg.project_id.slice(-8)}`) : "";
        lines.push("  " + wsTag + projTag);

        return lines;
      },
    }));
  }

  // ── Slash commands ────────────────────────────────────────────────────────────

  function registerCommands(): void {

    // /fulcrum-setup — (re-)run config wizard
    pi.registerCommand("fulcrum-setup", {
      description: "Configure Fulcrum workspace (IDs derived from project path, no files written)",
      handler: async (_args, ctx) => {
        const newCfg = await runSetupWizard(ctx as Parameters<typeof runSetupWizard>[0]);
        if (newCfg) {
          cfg = newCfg;
          baseUrl = `http://127.0.0.1:${cfg.monitor_port}`;
          updateStatus();
          await startServer();
        }
      },
    });

    // /fulcrum-status
    pi.registerCommand("fulcrum-status", {
      description: "Show Fulcrum workspace status",
      handler: async (_args, ctx) => {
        await refreshStatus();
        if (!snapshot) {
          ctx.ui.notify("No status — is the server running? Try /fulcrum-start", "warning");
          return;
        }
        const r = snapshot.running_agents ?? [];
        const b = snapshot.blocked_agents ?? [];
        ctx.ui.notify(
          `Fulcrum — ${snapshot.workspace_id}\n` +
          `Running: ${r.length}  Blocked: ${b.length}  WIP: ${snapshot.wip_count}\n` +
          r.map(a => `  ● ${a.role ?? "—"} [${a.status}]`).join("\n") +
          (b.length ? "\n" + b.map(a => `  ⚠ ${a.role ?? "—"}: blocked`).join("\n") : ""),
          "info",
        );
      },
    });

    // /fulcrum-start
    pi.registerCommand("fulcrum-start", {
      description: "Start the Fulcrum monitor server",
      handler: async (_args, ctx) => {
        if (serverState === "up") {
          ctx.ui.notify(`Server already running at http://127.0.0.1:${cfg.monitor_port}`, "info");
          return;
        }
        await startServer();
      },
    });

    // /fulcrum-monitor
    pi.registerCommand("fulcrum-monitor", {
      description: "Open the Fulcrum monitor in your browser",
      handler: async (_args, ctx) => {
        const url = `http://127.0.0.1:${cfg.monitor_port}`;
        const opener = process.platform === "darwin" ? "open"
          : process.platform === "win32" ? "start"
          : "xdg-open";
        spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
        ctx.ui.notify(`Opened ${url}`, "info");
      },
    });

    // /fulcrum-tasks [status]
    pi.registerCommand("fulcrum-tasks", {
      description: "List tasks: /fulcrum-tasks [open|in_progress|blocked|done]",
      handler: async (args, ctx) => {
        const status = args?.trim() ?? "";
        const qs = new URLSearchParams({ workspace_id: cfg.workspace_id });
        if (cfg.project_id) qs.set("project_id", cfg.project_id);
        if (status) qs.set("status", status);
        const data = await apiGet<Record<string, unknown>>(baseUrl, `/tasks?${qs}`);
        if (!data) { ctx.ui.notify("Could not fetch tasks", "error"); return; }
        const tasks = responseList<unknown>(data, "tasks");
        if (tasks.length === 0) {
          ctx.ui.notify(`No tasks${status ? ` with status "${status}"` : ""}`, "info");
          return;
        }
        const lines = tasks.slice(0, 20).map((t: unknown) => {
          const task = t as Record<string, unknown>;
          return `  [${String(task["status"] ?? "?").padEnd(10)}] ${String(task["title"] ?? "").slice(0, 52)}`;
        });
        ctx.ui.notify(`Tasks (${tasks.length}):\n${lines.join("\n")}`, "info");
      },
    });

    // /fulcrum-create <title>
    pi.registerCommand("fulcrum-create", {
      description: "Create a task: /fulcrum-create <title>",
      handler: async (args, ctx) => {
        const title = args?.trim();
        if (!title) { ctx.ui.notify("Usage: /fulcrum-create <title>", "error"); return; }
        const result = await apiPost<Record<string, unknown>>(baseUrl, "/tasks", {
          title, workspace_id: cfg.workspace_id, project_id: cfg.project_id || cfg.workspace_id,
        });
        if (!result || result["error"]) {
          ctx.ui.notify(`Failed: ${result?.["error"] ?? "unknown"}`, "error");
          return;
        }
        const task = responseDataObject<Record<string, unknown>>(result);
        ctx.ui.notify(`Created: ${task?.["task_id"] ?? "(unknown task)"} — "${title}"`, "success");
      },
    });

    // /fulcrum-run <task_id> <role>
    pi.registerCommand("fulcrum-run", {
      description: "Start an agent run: /fulcrum-run <task_id> <role>",
      handler: async (args, ctx) => {
        const parts = (args ?? "").trim().split(/\s+/);
        if (parts.length < 2) { ctx.ui.notify("Usage: /fulcrum-run <task_id> <role>", "error"); return; }
        const [task_id, agent_role] = parts;
        try {
          const result = execAction("start_agent_run", {
            task_id, agent_role,
            workspace_id: cfg.workspace_id,
            project_id: cfg.project_id,
          }) as Record<string, unknown>;
          ctx.ui.notify(`Run started: ${result?.["run_id"]} (${agent_role})`, "success");
          refreshStatus();
        } catch (err) {
          ctx.ui.notify(`Error: ${(err as Error).message}`, "error");
        }
      },
    });

    // /fulcrum-complete <run_id> [summary]
    pi.registerCommand("fulcrum-complete", {
      description: "Complete a run: /fulcrum-complete <run_id> [output summary]",
      handler: async (args, ctx) => {
        const str = (args ?? "").trim();
        const sp = str.indexOf(" ");
        const run_id = sp === -1 ? str : str.slice(0, sp);
        const summary = sp === -1 ? "" : str.slice(sp + 1);
        if (!run_id) { ctx.ui.notify("Usage: /fulcrum-complete <run_id> [summary]", "error"); return; }
        try {
          execAction("complete_agent_run", { run_id, output_summary: summary });
          ctx.ui.notify(`Run ${run_id.slice(-8)} completed`, "success");
          refreshStatus();
        } catch (err) {
          ctx.ui.notify(`Error: ${(err as Error).message}`, "error");
        }
      },
    });

    // /fulcrum-block <run_id> <reason>
    pi.registerCommand("fulcrum-block", {
      description: "Block a run: /fulcrum-block <run_id> <reason>",
      handler: async (args, ctx) => {
        const str = (args ?? "").trim();
        const sp = str.indexOf(" ");
        if (sp === -1) { ctx.ui.notify("Usage: /fulcrum-block <run_id> <reason>", "error"); return; }
        const run_id = str.slice(0, sp);
        const reason = str.slice(sp + 1);
        try {
          execAction("block_agent_run", { run_id, reason });
          ctx.ui.notify(`Run ${run_id.slice(-8)} blocked: ${reason}`, "warning");
          refreshStatus();
        } catch (err) {
          ctx.ui.notify(`Error: ${(err as Error).message}`, "error");
        }
      },
    });

    // /fulcrum-recall <query>
    pi.registerCommand("fulcrum-recall", {
      description: "Recall project memories: /fulcrum-recall <query>",
      handler: async (args, ctx) => {
        const query = (args ?? "").trim();
        if (!query) { ctx.ui.notify("Usage: /fulcrum-recall <query>", "error"); return; }
        const data = await apiPost<{ memories: unknown[] }>(
          baseUrl, "/memory/recall",
          { query, workspace_id: cfg.workspace_id, project_id: cfg.project_id || cfg.workspace_id, limit: 5 },
        );
        const mems = data?.memories ?? [];
        if (mems.length === 0) { ctx.ui.notify("No memories found", "info"); return; }
        const lines = mems.map((m: unknown) => {
          const mem = m as Record<string, unknown>;
          const score = typeof mem["score"] === "number" ? ` (${(mem["score"] as number).toFixed(2)})` : "";
          return `  ${String(mem["content"] ?? "").slice(0, 80)}${score}`;
        });
        ctx.ui.notify(`Memories for "${query}":\n${lines.join("\n")}`, "info");
      },
    });

    // /fulcrum-workspaces
    pi.registerCommand("fulcrum-workspaces", {
      description: "List all Fulcrum workspaces",
      handler: async (_args, ctx) => {
        const data = await apiGet<Record<string, unknown>>(baseUrl, "/workspaces");
        const ws = responseList<unknown>(data, "workspaces");
        if (ws.length === 0) {
          ctx.ui.notify("No workspaces found — run: fulcrum workspaces create", "info");
          return;
        }
        const lines = ws.map((w: unknown) => {
          const item = w as Record<string, unknown>;
          const active = item["workspace_id"] === cfg.workspace_id ? "  ← active" : "";
          return `  ${item["workspace_id"]}  ${item["name"]}${active}`;
        });
        ctx.ui.notify(`Workspaces:\n${lines.join("\n")}`, "info");
      },
    });

    // /fulcrum:role <slug> — switch the extension-level active role
    // (synthesized; PI has no `pi agent switch` primitive). The role MD body
    // is loaded from the cockpit's skills/roles/<slug>.md file and appended
    // to the systemPrompt via before_agent_start for every subsequent turn.
    pi.registerCommand("fulcrum:role", {
      description: "Switch Fulcrum role: /fulcrum:role <slug> (e.g. chief_of_staff, software_engineer)",
      handler: async (args, ctx) => {
        const slug = (args ?? "").trim().toLowerCase();
        if (!slug) {
          ctx.ui.notify(
            `Active role: ${activeRole ?? "(none)"}\n` +
            `Usage: /fulcrum:role <slug>  — e.g. chief_of_staff, software_engineer\n` +
            `       /fulcrum:role clear   — reset to default`,
            "info",
          );
          return;
        }
        if (slug === "clear" || slug === "none") {
          activeRole = null;
          activeRoleBody = null;
          ctx.ui.notify("Fulcrum role cleared", "info");
          return;
        }
        const roleFile = path.join(_dirPath, "skills", "roles", `${slug}.md`);
        if (!fs.existsSync(roleFile)) {
          ctx.ui.notify(`No role MD at ${roleFile}`, "error");
          return;
        }
        try {
          const raw = fs.readFileSync(roleFile, "utf8");
          const fm = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
          activeRole = slug;
          activeRoleBody = (fm ? fm[1] ?? raw : raw).trim();
          ctx.ui.notify(`Fulcrum role → ${slug}`, "success");
        } catch (err) {
          ctx.ui.notify(`Failed to load role: ${(err as Error).message}`, "error");
        }
      },
    });

    // /cos <goal> — inject CoS world-state context
    pi.registerCommand("cos", {
      description: "Inject Chief of Staff world-state context: /cos <goal>",
      handler: async (args, ctx) => {
        const goal = (args ?? "").trim();
        if (!goal) { ctx.ui.notify("Usage: /cos <goal>", "error"); return; }
        const data = await apiPost<{ context_markdown: string }>(
          baseUrl, "/cos-context",
          { project_id: cfg.project_id || cfg.workspace_id, workspace_id: cfg.workspace_id },
        );
        const md = data?.context_markdown ?? "";
        if (!md) { ctx.ui.notify("Could not build CoS context", "error"); return; }
        // Inject as a user message that primes the CoS agent
        pi.sendUserMessage(
          `<fulcrum-world-state goal="${goal}">\n${md}\n</fulcrum-world-state>\n\n` +
          `You are acting as Chief of Staff. Review the above world state and plan for: ${goal}`
        );
        ctx.ui.notify(`CoS world-state injected for: "${goal}"`, "success");
      },
    });
  }

  // ── LLM tools ─────────────────────────────────────────────────────────────────

  function registerTools(): void {

    // List tasks
    pi.registerTool({
      name: "fulcrum_list_tasks",
      label: "List Fulcrum Tasks",
      description: "List tasks in the Fulcrum control plane for the current workspace.",
      promptSnippet: "Check task backlog, find what needs doing, or look up task status.",
      promptGuidelines: [
        "Use this before starting work to find the relevant task_id.",
        "Filter by status=open to find unstarted work.",
      ],
      parameters: Type.Object({
        status: Type.Optional(Type.String({ description: "Filter: open|in_progress|blocked|done" })),
        limit:  Type.Optional(Type.Number({ description: "Max results (default 20)" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const qs = new URLSearchParams({ workspace_id: cfg.workspace_id });
        if (cfg.project_id) qs.set("project_id", cfg.project_id);
        if (args.status) qs.set("status", args.status);
        if (args.limit)  qs.set("limit", String(args.limit));
        const data = await apiGet<Record<string, unknown>>(baseUrl, `/tasks?${qs}`);
        const tasks = responseList<unknown>(data, "tasks");
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }], details: { count: tasks.length } };
      },
    });

    // Create task
    pi.registerTool({
      name: "fulcrum_create_task",
      label: "Create Fulcrum Task",
      description: "Create a new task in the Fulcrum control plane.",
      promptSnippet: "Use this to register new work items before starting an agent run.",
      parameters: Type.Object({
        title:         Type.String({ description: "Task title" }),
        description:   Type.Optional(Type.String({ description: "Task description" })),
        priority:      Type.Optional(Type.String({ description: "low|medium|high|critical" })),
        assigned_to:   Type.Optional(Type.String({ description: "Agent role to assign" })),
        done_criteria: Type.Optional(Type.String({ description: "Definition of done" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost<Record<string, unknown>>(baseUrl, "/tasks", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id || cfg.workspace_id,
        });
        const task = responseDataObject<Record<string, unknown>>(result);
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(task ?? result, null, 2) }], details: task ?? result ?? {} };
      },
    });

    // Update task
    pi.registerTool({
      name: "fulcrum_update_task",
      label: "Update Fulcrum Task",
      description: "Update a task status, add a blocker note, or reassign it.",
      promptSnippet: "Use this to mark tasks as running, blocked, or completed.",
      parameters: Type.Object({
        task_id:     Type.String({ description: "Task ID (tsk_...)" }),
        status:      Type.Optional(Type.String({ description: "open|in_progress|blocked|done" })),
        note:        Type.Optional(Type.String({ description: "Progress note or blocker description" })),
        assigned_to: Type.Optional(Type.String({ description: "New agent role" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const { task_id, ...body } = args;
        const result = await apiPatch(baseUrl, `/tasks/${task_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Recall memory
    pi.registerTool({
      name: "fulcrum_recall_memory",
      label: "Recall Fulcrum Memory",
      description: "Recall relevant project memories from the Fulcrum memory store.",
      promptSnippet: "Search project knowledge base before making architectural decisions.",
      parameters: Type.Object({
        query: Type.String({ description: "Natural-language search query" }),
        limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost<{ memories: unknown[] }>(
          baseUrl, "/memory/recall",
          {
            query: args.query,
            workspace_id: cfg.workspace_id,
            project_id: cfg.project_id || cfg.workspace_id,
            limit: args.limit ?? 10,
          },
        );
        const mems = result?.memories ?? [];
        return { content: [{ type: "text", text: JSON.stringify(mems, null, 2) }], details: { count: mems.length } };
      },
    });

    // Write memory
    pi.registerTool({
      name: "fulcrum_write_memory",
      label: "Write Fulcrum Memory",
      description: "Persist a note to the Fulcrum project memory store for future recall.",
      promptSnippet: "Save important decisions, findings, or architectural notes.",
      parameters: Type.Object({
        content: Type.String({ description: "Memory content" }),
        title:   Type.Optional(Type.String({ description: "Memory title" })),
        tags:    Type.Optional(Type.String({ description: "Comma-separated tags" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost(baseUrl, "/memory/write", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id || cfg.workspace_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Start run
    pi.registerTool({
      name: "fulcrum_start_run",
      label: "Start Fulcrum Agent Run",
      description: "Register a new agent run in the Fulcrum control plane. Call this at the start of every task.",
      promptSnippet: "Register yourself before starting any task. Returns run_id for subsequent heartbeat/complete/block calls.",
      promptGuidelines: [
        "Call at the very start of your task, before doing any work.",
        "Use the returned run_id for heartbeat, complete, and block calls.",
      ],
      parameters: Type.Object({
        task_id:       Type.Optional(Type.String({ description: "Task ID (tsk_...) — auto-created if omitted" })),
        agent_role:    Type.String({ description: "Your role (e.g. software_engineer, chief_of_staff)" }),
        worktree_path: Type.Optional(Type.String({ description: "Git worktree path if using worktrees" })),
        pi_run_id:     Type.Optional(Type.String({ description: "Supply a specific run ID" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = execAction("start_agent_run", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        }) as Record<string, unknown>;
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result ?? {} };
      },
    });

    // Heartbeat
    pi.registerTool({
      name: "fulcrum_heartbeat",
      label: "Fulcrum Agent Heartbeat",
      description: "Send a heartbeat for an active agent run (call every ~30 s of active work).",
      promptSnippet: "Send periodically during long operations so the dashboard shows live progress.",
      parameters: Type.Object({
        run_id:       Type.String({ description: "Run ID (from fulcrum_start_run)" }),
        current_step: Type.Optional(Type.String({ description: "What you are doing right now" })),
        progress_pct: Type.Optional(Type.Number({ description: "Estimated completion 0–100" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = execAction("heartbeat_agent_run", args) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Complete run
    pi.registerTool({
      name: "fulcrum_complete_run",
      label: "Complete Fulcrum Agent Run",
      description: "Mark an agent run as completed. Call this when your task is done.",
      promptSnippet: "Call when task is complete to update the dashboard and task status.",
      parameters: Type.Object({
        run_id:         Type.String({ description: "Run ID (from fulcrum_start_run)" }),
        summary:        Type.Optional(Type.String({ description: "One-paragraph summary of what was done" })),
        artifact_paths: Type.Optional(Type.String({ description: "Comma-separated paths to created/modified files" })),
        tests_passed:   Type.Optional(Type.Number({ description: "Number of tests passed" })),
        tests_failed:   Type.Optional(Type.Number({ description: "Number of tests failed" })),
        pr_url:         Type.Optional(Type.String({ description: "Pull request URL if one was created" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const { run_id, artifact_paths, summary, ...body } = args;
        const paths = artifact_paths ? artifact_paths.split(",").map(p => p.trim()).filter(Boolean) : [];
        const result = execAction("complete_agent_run", {
          run_id,
          ...body,
          ...(summary ? { output_summary: summary } : {}),
          ...(paths.length > 0 ? { artifact_paths: paths } : {}),
        }) as Record<string, unknown>;
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Block run
    pi.registerTool({
      name: "fulcrum_block_run",
      label: "Block Fulcrum Agent Run",
      description: "Mark an agent run as blocked. Use when you need human input or a dependency is unmet.",
      promptSnippet: "Call when you cannot proceed without external input. Describe what you need.",
      parameters: Type.Object({
        run_id:            Type.String({ description: "Run ID (from fulcrum_start_run)" }),
        reason:            Type.String({ description: "Why you are blocked — what is needed to unblock" }),
        escalation_reason: Type.Optional(Type.String({ description: "Additional context for the Chief of Staff" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = execAction("block_agent_run", args) as Record<string, unknown>;
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Workspace status
    pi.registerTool({
      name: "fulcrum_workspace_status",
      label: "Fulcrum Workspace Status",
      description: "Get a workspace status snapshot: active runs, blockers, WIP count.",
      promptSnippet: "Call to get an overview of what other agents are doing before planning.",
      parameters: Type.Object({}),
      execute: async (_id, _args, _sig, _upd, _ctx) => {
        await refreshStatus();
        return {
          content: [{ type: "text", text: snapshot ? JSON.stringify(snapshot, null, 2) : "No status available — is the server running?" }],
          details: snapshot ?? {},
        };
      },
    });

    // Build CoS context
    pi.registerTool({
      name: "fulcrum_build_cos_context",
      label: "Build Fulcrum CoS World-State",
      description: "Build a world-state snapshot for the Chief of Staff agent, including task board, active runs, and recent events.",
      promptSnippet: "Use before dispatching a Chief of Staff planning pass.",
      parameters: Type.Object({
        goal: Type.Optional(Type.String({ description: "The planning goal for this CoS invocation" })),
        max_tokens: Type.Optional(Type.Number({ description: "Maximum tokens for the context (default 2000)" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost<{ context_markdown: string }>(
          baseUrl, "/cos-context",
          {
            project_id: cfg.project_id || cfg.workspace_id,
            workspace_id: cfg.workspace_id,
            max_tokens: args.max_tokens,
          },
        );
        return {
          content: [{ type: "text", text: result?.context_markdown ?? "Could not build CoS context" }],
        };
      },
    });
  }

  // ── Policy hook ───────────────────────────────────────────────────────────────

  function registerPolicyHook(): void {
    pi.on("tool_call", async (event, _ctx) => {
      const toolName: string = (event as Record<string, unknown>)["toolName"] as string ?? "";
      // Skip our own tools to avoid infinite recursion
      if (!toolName || toolName.startsWith("fulcrum_") || toolName.startsWith("mcp__fulcrum__")) return;

      const input = (event as Record<string, unknown>)["input"] ?? {};
      const hookEvent = JSON.stringify({
        tool_name: toolName,
        tool_input: input,
        role: process.env["FULCRUM_AGENT_ROLE"] ?? "software_engineer",
        runId: currentRunId ?? "",
        session_id: cfg.workspace_id,
      });

      const result = spawnSync("fulcrum", ["hook", "pi"], {
        input: hookEvent,
        encoding: "utf-8",
        timeout: 5_000,
      });

      if (result.status !== 0 && result.status !== null) {
        let reason = "denied by Fulcrum policy";
        try {
          const out = JSON.parse((result.stdout as string) ?? "{}") as Record<string, unknown>;
          if (typeof out["message"] === "string") reason = out["message"];
        } catch { /* use default */ }
        return { block: true, reason };
      }
    });
  }

  // ── Agent lifecycle hooks ─────────────────────────────────────────────────────

  function registerAgentLifecycle(): void {
    // before_agent_start: inject workspace snapshot as a system prompt.
    // Note: the agent run itself is started once per SESSION in session_start,
    // not per agent turn — starting per turn is what caused zombie rows to
    // accumulate when PI crashed between agent_end firings.
    pi.on("before_agent_start", async (event, ctx) => {
      const usage = (ctx as Record<string, unknown>)["getContextUsage"]?.();
      const overBudget = usage && (usage as Record<string, unknown>)["tokens"] > 8000;

      const basePrompt = (event as Record<string, unknown>)["systemPrompt"] as string ?? "";
      const additions: string[] = [];

      if (process.env["FULCRUM_NO_RECALL_NUDGE"] !== "1") {
        additions.push(buildFulcrumFirstNudge(cfg.workspace_id, currentRunId));
      }

      if (!overBudget && snapshot) {
        const r = snapshot.running_agents ?? [];
        const b = snapshot.blocked_agents ?? [];
        if (r.length > 0 || b.length > 0) {
          const lines: string[] = [`[Fulcrum] Workspace: ${cfg.workspace_id}`];
          if (currentRunId) lines.push(`Run ID: ${currentRunId}`);
          if (r.length > 0) lines.push(`Active runs: ${r.map(x => x.role ?? "—").join(", ")}`);
          if (b.length > 0) lines.push(`⚠ Blocked: ${b.map(x => x.role ?? "—").join(", ")}`);
          additions.push(lines.join("\n"));
        }
      }

      if (activeRole && activeRoleBody) {
        additions.push(`## Fulcrum role: ${activeRole}\n\n${activeRoleBody}`);
      }

      if (additions.length === 0) return;
      return { systemPrompt: `${basePrompt}\n\n${additions.join("\n\n")}` };
    });
  }

  // ── Observational lifecycle hooks ────────────────────────────────────────────
  // PI has a rich 24-event taxonomy. Fulcrum binds observational handlers on
  // all of them so cockpit telemetry + policy-engine decisions can layer on
  // top of a consistent audit surface. Handlers stay thin by design — anything
  // heavier than logging belongs in its own function (see registerPolicyHook).

  function registerObservationalEvents(): void {
    // agent_end — fires once per user prompt after the agent loop drains.
    // Useful later for per-turn memory emit; today it beats the heartbeat so
    // long-running sessions don't appear idle to the sweep.
    pi.on("agent_end", async (_event, _ctx) => {
      if (!currentRunId) return;
      try {
        execAction("heartbeat_agent_run", { run_id: currentRunId, current_step: "agent_end" });
      } catch { /* non-fatal */ }
    });

    // tool_result — fires after each tool execution. Mutating tools may be
    // mirrored into memory in a later PR; today the extensions-layer policy
    // check lives in registerPolicyHook's tool_call path.
    pi.on("tool_result", async (_event, _ctx) => { /* observational */ });

    // context — modifies outgoing messages non-destructively. Today it is a
    // pass-through; future work may inject recalled memory here.
    pi.on("context", async (_event, _ctx) => { /* pass-through */ });

    // before_provider_request — observational only (provider serialization
    // debug hook). Returning undefined keeps the payload unchanged.
    pi.on("before_provider_request", (_event, _ctx) => { /* observational */ });

    // turn_start / turn_end — per-turn lifecycle. turn_end is a natural
    // heartbeat moment for long multi-turn conversations.
    pi.on("turn_start", async (_event, _ctx) => { /* observational */ });
    pi.on("turn_end", async (_event, _ctx) => {
      if (!currentRunId) return;
      try {
        execAction("heartbeat_agent_run", { run_id: currentRunId, current_step: "turn_end" });
      } catch { /* non-fatal */ }
    });

    // session_before_compact — fires right before session compaction. Future
    // parity with Claude PreCompact: emit a summary memory row before the
    // transcript is truncated.
    pi.on("session_before_compact", async (_event, _ctx) => { /* observational; parity with Claude PreCompact pending */ });

    // user_bash — `!` / `!!` commands from the user. Pass-through; cockpit
    // does not intercept bash today.
    pi.on("user_bash", (_event, _ctx) => { /* pass-through */ });

    // input — first input event each turn. Observational anchor for future
    // per-turn state resets.
    pi.on("input", async (_event, _ctx) => { /* observational */ });
  }

  // ── Skills contribution ───────────────────────────────────────────────────────
  // Contribute Fulcrum agent skills to PI's skill discovery system.
  // Skills are in agent-integration/skills/ (two levels up from cockpit/).

  pi.on("resources_discover", async (_event, _ctx) => {
    const skillsDir = path.join(_dirPath, "..", "..", "skills");
    if (fs.existsSync(skillsDir)) {
      return { skillPaths: [skillsDir] };
    }
    return {};
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  pi.on("session_start", async (event, ctx) => {
    cwd = (ctx as Record<string, unknown>)["cwd"] as string ?? process.cwd();
    uiRef = ctx.ui as typeof uiRef;

    cfg = loadCockpitConfig(cwd);
    baseUrl = `http://127.0.0.1:${cfg.monitor_port}`;

    // Register UI before anything else so widget appears immediately
    registerWidget(ctx as Parameters<typeof registerWidget>[0]);
    updateStatus();

    // Register commands, tools, hooks, and lifecycle handlers (idempotent across reloads)
    registerCommands();
    registerTools();
    registerPolicyHook();
    registerAgentLifecycle();
    registerObservationalEvents();

    // Workspace/project IDs are derived from the cwd in loadCockpitConfig —
    // there is no project-local config file. If the user wants custom IDs or
    // a different monitor port they can run `/fulcrum-setup` on demand.
    await startServer();
    pollTimer = setInterval(() => { if (serverState === "up") refreshStatus(); }, 5000);

    // Reap zombie runs from prior PI sessions that crashed before firing
    // session_shutdown — else they linger at status='running' forever.
    if (cfg.workspace_id) {
      try {
        const reaped = execAction("sweep_stale_runs", {
          workspace_id: cfg.workspace_id,
          stale_minutes: 10,
        }) as { reaped: string[] };
        if (reaped?.reaped?.length) {
          process.stderr.write(`[fulcrum/session] reaped ${reaped.reaped.length} stale run(s) from prior PI sessions\n`);
        }
      } catch { /* non-fatal */ }
    }

    // One Fulcrum run per PI session (previously one per agent turn, which
    // piled up `status=running` rows without heartbeats). We start it here
    // and complete it on session_shutdown.
    if (!currentRunId && cfg.workspace_id) {
      try {
        const agentRole = process.env["FULCRUM_AGENT_ROLE"] ?? "software_engineer";
        const result = execAction("start_agent_run", {
          agent_role: agentRole,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
          context_type: "primary",
        }) as Record<string, unknown>;
        currentRunId = (result?.["run_id"] as string | undefined) ?? null;
        if (currentRunId) {
          process.stderr.write(`[fulcrum/session] pi run started: ${currentRunId}\n`);
        }
      } catch (err) {
        process.stderr.write(`[fulcrum/session] start_agent_run failed (non-fatal): ${(err as Error).message}\n`);
      }
    }

    // 30 s heartbeat so the janitor / sweep_stale_runs never reaps the run
    // while PI is still alive.
    heartbeatTimer = setInterval(() => {
      if (!currentRunId) return;
      try {
        execAction("heartbeat_agent_run", { run_id: currentRunId });
      } catch { /* non-fatal */ }
    }, 30_000);
  });

  pi.on("session_shutdown", async () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (pollTimer)      { clearInterval(pollTimer);      pollTimer = null; }

    if (currentRunId) {
      const runId = currentRunId;
      currentRunId = null;
      try {
        execAction("complete_agent_run", {
          run_id: runId,
          output_summary: "PI session shutdown",
        });
      } catch { /* non-fatal */ }
    }
    stopServer();
  });
}
