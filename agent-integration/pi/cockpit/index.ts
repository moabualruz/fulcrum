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
 *   pi install npm:fulcrum-cockpit
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
const { spawn, execSync } = require("child_process") as typeof import("child_process");
const { createHash } = require("crypto") as typeof import("crypto");
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CockpitConfig {
  workspace_id: string;
  project_id: string;
  monitor_port: number;
}

interface AgentRunRow {
  run_id: string;
  agent_role: string;
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

function computeProjectIds(absPath: string): { workspace_id: string; project_id: string } {
  const hash = createHash("sha256").update(absPath).digest("hex").slice(0, 12);
  const sanitizedName = path.basename(absPath).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) || "project";
  return {
    workspace_id: `ws_${sanitizedName}_${hash}`,
    project_id: `proj_${sanitizedName}_${hash}`,
  };
}

function loadCockpitConfig(cwd: string): CockpitConfig {
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

// ── Fulcrum CLI check ──────────────────────────────────────────────────────────

function isFulcrumInstalled(): boolean {
  try {
    execSync("fulcrum --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
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
  let uiRef: { setStatus: (id: string, s?: string) => void; notify: (msg: string, level: string) => void } | null = null;

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
        "Run: npm install -g @moabualruz/fulcrum-cli\n" +
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
      execSync(`fulcrum task list --workspace ${workspace_id} --limit 1`, {
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
      uiRef?.notify("Failed to start Fulcrum monitor — is fulcrum installed? (npm install -g @moabualruz/fulcrum-cli)", "error");
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
          const role = run.agent_role.slice(0, 18).padEnd(18);
          lines.push(`  ${GREEN("●")} ${CYAN(role)} ${MUTED(run.run_id.slice(-8))}`);
        }

        // Blocked agents
        for (const run of blocked.slice(0, 3)) {
          const role = run.agent_role.slice(0, 18).padEnd(18);
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
          r.map(a => `  ● ${a.agent_role} [${a.status}]`).join("\n") +
          (b.length ? "\n" + b.map(a => `  ⚠ ${a.agent_role}: blocked`).join("\n") : ""),
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
        const data = await apiGet<{ tasks: unknown[] }>(baseUrl, `/tasks?${qs}`);
        if (!data) { ctx.ui.notify("Could not fetch tasks", "error"); return; }
        const tasks = data.tasks ?? [];
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
        ctx.ui.notify(`Created: ${result["task_id"]} — "${title}"`, "success");
      },
    });

    // /fulcrum-run <task_id> <role>
    pi.registerCommand("fulcrum-run", {
      description: "Start an agent run: /fulcrum-run <task_id> <role>",
      handler: async (args, ctx) => {
        const parts = (args ?? "").trim().split(/\s+/);
        if (parts.length < 2) { ctx.ui.notify("Usage: /fulcrum-run <task_id> <role>", "error"); return; }
        const [task_id, agent_role] = parts;
        const result = await apiPost<Record<string, unknown>>(baseUrl, "/runs", {
          task_id, agent_role, workspace_id: cfg.workspace_id, project_id: cfg.project_id,
        });
        if (result?.["error"]) { ctx.ui.notify(`Error: ${result["error"]}`, "error"); return; }
        ctx.ui.notify(`Run started: ${result?.["run_id"]} (${agent_role})`, "success");
        refreshStatus();
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
        await apiPost(baseUrl, `/runs/${run_id}/complete`, { summary });
        ctx.ui.notify(`Run ${run_id.slice(-8)} completed`, "success");
        refreshStatus();
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
        await apiPost(baseUrl, `/runs/${run_id}/block`, { reason });
        ctx.ui.notify(`Run ${run_id.slice(-8)} blocked: ${reason}`, "warning");
        refreshStatus();
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
        const data = await apiGet<{ workspaces: unknown[] }>(baseUrl, "/workspaces");
        const ws = data?.workspaces ?? [];
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
        const data = await apiGet<{ tasks: unknown[] }>(baseUrl, `/tasks?${qs}`);
        const tasks = data?.tasks ?? [];
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
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result ?? {} };
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
        const result = await apiPost<Record<string, unknown>>(baseUrl, "/runs", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        });
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
        const { run_id, ...body } = args;
        const result = await apiPost(baseUrl, `/runs/${run_id}/heartbeat`, body);
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
        const { run_id, artifact_paths, ...body } = args;
        const paths = artifact_paths ? artifact_paths.split(",").map(p => p.trim()).filter(Boolean) : [];
        const result = await apiPost(baseUrl, `/runs/${run_id}/complete`, {
          ...body,
          ...(paths.length > 0 ? { artifact_paths: paths } : {}),
        });
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
        const { run_id, ...body } = args;
        const result = await apiPost(baseUrl, `/runs/${run_id}/block`, body);
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
      if (serverState !== "up") return;
      const toolName: string = (event as Record<string, unknown>)["toolName"] as string ?? "";
      // Skip our own tools to avoid infinite recursion
      if (!toolName || toolName.startsWith("fulcrum_") || toolName.startsWith("mcp__fulcrum__")) return;

      const input = (event as Record<string, unknown>)["input"] ?? {};
      const check = await apiPost<{ allowed: boolean; reason: string }>(
        baseUrl, "/policy/check",
        {
          action: `tool_use:${toolName}`,
          resource: toolName,
          actor_id: "pi",
          workspace_id: cfg.workspace_id,
          actor_type: "agent",
          extra: input,
        },
      );
      if (check && !check.allowed) {
        return { block: true, reason: `[fulcrum policy] ${check.reason}` };
      }
    });
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  pi.on("session_start", async (event, ctx) => {
    cwd = (ctx as Record<string, unknown>)["cwd"] as string ?? process.cwd();
    uiRef = ctx.ui as typeof uiRef;

    cfg = loadCockpitConfig(cwd);
    baseUrl = `http://127.0.0.1:${cfg.monitor_port}`;

    // Register UI before anything else so widget appears immediately
    registerWidget(ctx as Parameters<typeof registerWidget>[0]);
    updateStatus();

    // Register commands and tools (idempotent across reloads)
    registerCommands();
    registerTools();
    registerPolicyHook();

    // First-run setup wizard: show on startup if no config file found
    const reason = (event as Record<string, unknown>)["reason"] as string ?? "";
    if (reason === "startup" && !findConfigFile(cwd)) {
      // Small delay so widget renders first
      setTimeout(async () => {
        const newCfg = await runSetupWizard(ctx as Parameters<typeof runSetupWizard>[0]);
        if (newCfg) {
          cfg = newCfg;
          baseUrl = `http://127.0.0.1:${cfg.monitor_port}`;
        }
        await startServer();
        pollTimer = setInterval(() => { if (serverState === "up") refreshStatus(); }, 5000);
      }, 500);
    } else {
      await startServer();
      pollTimer = setInterval(() => { if (serverState === "up") refreshStatus(); }, 5000);
    }
  });

  pi.on("session_shutdown", async () => {
    stopServer();
  });
}
