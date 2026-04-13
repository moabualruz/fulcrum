/**
 * PI Agent OS Cockpit Extension
 *
 * Full control-plane dashboard for the PI coding agent:
 *   - Live workspace status widget (runs, blockers, WIP, queue depth)
 *   - Footer with quick-glance counters and monitor URL
 *   - /pi-* slash commands for task, run, memory, and CoS operations
 *   - LLM-callable tools for all control-plane operations
 *   - tool_call hook for policy enforcement
 *   - Auto-starts the pi-os monitor + control API server
 *
 * Install:
 *   pi install ./agent-integration/pi/cockpit
 *   # or from npm:
 *   pi install npm:pi-os-cockpit
 *
 * Config — create .pi-os.json in your project root:
 *   { "workspace_id": "ws_...", "project_id": "proj_...", "monitor_port": 4721 }
 *
 * Or set env vars: PI_OS_WORKSPACE_ID, PI_OS_PROJECT_ID, PI_OS_PORT
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
const { spawn } = require("child_process") as typeof import("child_process");
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CockpitConfig {
  workspace_id: string;
  project_id: string;
  monitor_port: number;
}

interface AgentRunRow {
  id: string;
  agent_role: string;
  status: string;
  current_step?: string;
  progress_pct?: number;
  heartbeat_at?: string;
  blocker?: string;
  task_id?: string;
}

interface WorkspaceSnapshot {
  workspace_id: string;
  running_agents: AgentRunRow[];
  blocked_agents: AgentRunRow[];
  wip_count: number;
  recent_events: unknown[];
  ts: string;
}

// ── Config discovery ──────────────────────────────────────────────────────────

function loadConfig(cwd: string): CockpitConfig {
  const defaults: CockpitConfig = {
    workspace_id: process.env["PI_OS_WORKSPACE_ID"] ?? "",
    project_id: process.env["PI_OS_PROJECT_ID"] ?? "",
    monitor_port: parseInt(process.env["PI_OS_PORT"] ?? "4721", 10),
  };
  // Walk up directory tree looking for .pi-os.json
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const cfg = path.join(dir, ".pi-os.json");
    if (fs.existsSync(cfg)) {
      try {
        return { ...defaults, ...JSON.parse(fs.readFileSync(cfg, "utf-8")) };
      } catch {
        /* ignore malformed config */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return defaults;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiGet<T>(baseUrl: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function apiPost<T>(baseUrl: string, path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
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

async function apiPatch<T>(baseUrl: string, path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
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
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/control/workspaces`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

// ── Colour helpers (ANSI) ─────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function fg(r: number, g: number, b: number, s: string): string {
  return `\x1b[38;2;${r};${g};${b}m${s}${RESET}`;
}

const GREEN  = (s: string) => fg(100, 220, 120, s);
const YELLOW = (s: string) => fg(255, 210, 60, s);
const RED    = (s: string) => fg(255, 80, 80, s);
const CYAN   = (s: string) => fg(80, 200, 220, s);
const BLUE   = (s: string) => fg(100, 150, 255, s);
const MUTED  = (s: string) => `${DIM}${s}${RESET}`;

// Truncate a string (ignoring ANSI codes) to maxLen visible chars
function trunc(s: string, maxLen: number): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  if (plain.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

// ── Main extension ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let cfg: CockpitConfig;
  let baseUrl: string;
  let serverProc: ReturnType<typeof spawn> | null = null;
  let serverState: "stopped" | "starting" | "up" | "error" = "stopped";
  let snapshot: WorkspaceSnapshot | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let widgetCtx: Parameters<Parameters<typeof pi.on>[1]>[1] | null = null;

  // ── Server management ───────────────────────────────────────────────────────

  async function startServer(ctx: typeof widgetCtx): Promise<void> {
    if (await isServerUp(cfg.monitor_port)) {
      serverState = "up";
      return;
    }
    serverState = "starting";
    ctx?.ui.notify(`Starting PI Agent OS server on port ${cfg.monitor_port}…`, "info");

    const proc = spawn(
      "python",
      ["-m", "pi_agent_os.monitor", "--port", String(cfg.monitor_port)],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        detached: false,
      },
    );

    serverProc = proc;

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      if (chunk.includes("Application startup complete") || chunk.includes("Uvicorn running")) {
        serverState = "up";
        ctx?.ui.notify(`PI Agent OS server up at http://127.0.0.1:${cfg.monitor_port}`, "success");
        refreshStatus();
      }
    });

    proc.on("error", () => {
      serverState = "error";
      ctx?.ui.notify("Failed to start pi-os server — is pi_agent_os installed?", "error");
    });

    proc.on("close", (code: number) => {
      if (serverState !== "stopped") serverState = code === 0 ? "stopped" : "error";
      serverProc = null;
    });

    // Fallback: poll until up (max 15s)
    let attempts = 0;
    const check = setInterval(async () => {
      attempts++;
      if (await isServerUp(cfg.monitor_port)) {
        serverState = "up";
        ctx?.ui.notify(`PI Agent OS server ready at http://127.0.0.1:${cfg.monitor_port}`, "success");
        refreshStatus();
        clearInterval(check);
      } else if (attempts >= 15) {
        clearInterval(check);
        if (serverState === "starting") {
          serverState = "error";
          ctx?.ui.notify("PI Agent OS server did not start within 15s", "error");
        }
      }
    }, 1000);
  }

  function stopServer(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (serverProc) {
      serverState = "stopped";
      serverProc.kill("SIGTERM");
      serverProc = null;
    }
  }

  // ── Status polling ──────────────────────────────────────────────────────────

  async function refreshStatus(): Promise<void> {
    if (!cfg.workspace_id || serverState !== "up") return;
    const data = await apiGet<WorkspaceSnapshot>(
      baseUrl,
      `/api/v1/status?workspace_id=${encodeURIComponent(cfg.workspace_id)}`,
    );
    if (data && !("error" in (data as object))) {
      snapshot = data;
    }
  }

  // ── Widget rendering ────────────────────────────────────────────────────────

  function registerWidgets(ctx: NonNullable<typeof widgetCtx>): void {
    // ─ Dashboard widget (above editor) ─────────────────────────────────────
    ctx.ui.setWidget("pi-os-cockpit", (_tui: unknown, _theme: unknown) => {
      const headerText = new Text("", 1, 0);
      const bodyText = new Text("", 1, 0);
      const container = new Container();
      container.addChild(headerText);
      container.addChild(bodyText);

      return {
        render(width: number): string[] {
          const sep = MUTED("─".repeat(Math.min(width - 4, 60)));

          // Header
          const serverDot =
            serverState === "up"      ? GREEN("●") :
            serverState === "starting"? YELLOW("◐") :
            serverState === "error"   ? RED("✗")   : MUTED("○");
          headerText.setText(
            `${BOLD}${CYAN("PI Agent OS")}${RESET}  ${serverDot}  ` +
            MUTED(`http://127.0.0.1:${cfg.monitor_port}`)
          );

          if (!snapshot) {
            const msg = !cfg.workspace_id
              ? YELLOW("⚠ No workspace_id — create .pi-os.json in project root")
              : serverState === "starting"
              ? MUTED("Starting server…")
              : MUTED("Polling…");
            bodyText.setText(msg);
            return container.render(width);
          }

          const running = snapshot.running_agents ?? [];
          const blocked = snapshot.blocked_agents ?? [];
          const wip = snapshot.wip_count ?? 0;

          // Summary row
          const rCount = GREEN(`● ${running.length} running`);
          const bCount = blocked.length > 0 ? RED(`  ⚠ ${blocked.length} blocked`) : MUTED("  0 blocked");
          const wCount = MUTED(`  WIP: ${wip}`);

          const lines: string[] = [sep, rCount + bCount + wCount, sep];

          // Running agents
          for (const run of running.slice(0, 5)) {
            const pct = run.progress_pct ? `  ${Math.round(run.progress_pct)}%` : "";
            const step = run.current_step ? MUTED(`  ${run.current_step.slice(0, 28)}`) : "";
            lines.push(
              `  ${GREEN("●")} ${CYAN(run.agent_role.slice(0, 20).padEnd(20))}` +
              `${MUTED(run.id.slice(-8))}${pct}${step}`
            );
          }

          // Blocked agents
          for (const run of blocked.slice(0, 3)) {
            const reason = run.blocker ? run.blocker.slice(0, 35) : "unknown";
            lines.push(
              `  ${RED("⚠")} ${YELLOW(run.agent_role.slice(0, 20).padEnd(20))}` +
              `${MUTED(run.id.slice(-8))}  ${RED(reason)}`
            );
          }

          if (running.length === 0 && blocked.length === 0) {
            lines.push(MUTED("  No active agent runs"));
          }

          if (!cfg.workspace_id) {
            lines.push(sep, YELLOW("⚠ Set workspace_id in .pi-os.json or PI_OS_WORKSPACE_ID env"));
          } else {
            lines.push(sep, MUTED(`  ws: ${cfg.workspace_id.slice(-12)}  proj: ${cfg.project_id.slice(-12) || "(any)"}`));
          }

          bodyText.setText(lines.join("\n"));
          return container.render(width);
        },
        invalidate() {
          headerText.invalidate();
          bodyText.invalidate();
          container.invalidate();
        },
      };
    });

    // ─ Footer ───────────────────────────────────────────────────────────────
    ctx.ui.setFooter((_tui: unknown, _theme: unknown) => ({
      dispose: () => {},
      invalidate() {},
      render(width: number): string[] {
        const dot =
          serverState === "up"      ? GREEN("●") :
          serverState === "starting"? YELLOW("◐") :
          serverState === "error"   ? RED("✗")   : MUTED("○");

        const r = snapshot?.running_agents?.length ?? 0;
        const b = snapshot?.blocked_agents?.length ?? 0;
        const w = snapshot?.wip_count ?? 0;

        const left = ` ${dot} ${CYAN("PI-OS")}  ${GREEN(String(r) + " run")}  ` +
          (b > 0 ? RED(`${b} blocked  `) : "") +
          MUTED(`WIP:${w}`);
        const right = MUTED(` :${cfg.monitor_port} `);

        // Pad between left and right
        const plainLeft = left.replace(/\x1b\[[0-9;]*m/g, "");
        const plainRight = right.replace(/\x1b\[[0-9;]*m/g, "");
        const pad = Math.max(1, width - plainLeft.length - plainRight.length);
        return [left + " ".repeat(pad) + right];
      },
    }));
  }

  // ── Slash commands ──────────────────────────────────────────────────────────

  function registerCommands(): void {
    // /pi-status — print full workspace status
    pi.registerCommand("pi-status", {
      description: "Show PI Agent OS workspace status",
      handler: async (_args, ctx) => {
        await refreshStatus();
        if (!snapshot) {
          ctx.ui.notify("No status available — is the server running? Use /pi-start", "warning");
          return;
        }
        const r = snapshot.running_agents ?? [];
        const b = snapshot.blocked_agents ?? [];
        const lines = [
          `PI Agent OS — workspace: ${snapshot.workspace_id}`,
          `Running: ${r.length}  Blocked: ${b.length}  WIP: ${snapshot.wip_count}`,
          ...r.map(a => `  ● ${a.agent_role} [${a.status}] ${a.current_step ?? ""}`),
          ...b.map(a => `  ⚠ ${a.agent_role} blocked: ${a.blocker ?? "?"}`),
        ];
        ctx.ui.notify(lines.join("\n"), "info");
      },
    });

    // /pi-start — start the server manually
    pi.registerCommand("pi-start", {
      description: "Start the PI Agent OS monitor server",
      handler: async (_args, ctx) => {
        if (serverState === "up") {
          ctx.ui.notify(`Server already up at http://127.0.0.1:${cfg.monitor_port}`, "info");
          return;
        }
        await startServer(ctx);
      },
    });

    // /pi-monitor — open monitor in browser
    pi.registerCommand("pi-monitor", {
      description: "Open the PI Agent OS monitor in your browser",
      handler: async (_args, ctx) => {
        const url = `http://127.0.0.1:${cfg.monitor_port}`;
        const opener = process.platform === "darwin" ? "open"
          : process.platform === "win32" ? "start"
          : "xdg-open";
        spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
        ctx.ui.notify(`Opening ${url}`, "info");
      },
    });

    // /pi-tasks [status] — list tasks
    pi.registerCommand("pi-tasks", {
      description: "List tasks: /pi-tasks [queued|in_progress|completed|blocked]",
      handler: async (args, ctx) => {
        const status = args?.trim() ?? "";
        const qs = new URLSearchParams({ workspace_id: cfg.workspace_id });
        if (cfg.project_id) qs.set("project_id", cfg.project_id);
        if (status) qs.set("status", status);
        const data = await apiGet<{ tasks: unknown[] }>(baseUrl, `/api/v1/control/tasks?${qs}`);
        if (!data) {
          ctx.ui.notify("Could not fetch tasks — server running?", "error");
          return;
        }
        const tasks = data.tasks ?? [];
        if (tasks.length === 0) {
          ctx.ui.notify(`No tasks${status ? ` with status "${status}"` : ""}`, "info");
          return;
        }
        const lines = tasks.slice(0, 15).map((t: unknown) => {
          const task = t as Record<string, unknown>;
          return `  [${String(task["status"] ?? "?").padEnd(11)}] ${String(task["title"] ?? "").slice(0, 50)}`;
        });
        ctx.ui.notify(`Tasks (${tasks.length}):\n${lines.join("\n")}`, "info");
      },
    });

    // /pi-create <title> — create a task
    pi.registerCommand("pi-create", {
      description: "Create a task: /pi-create <title>",
      handler: async (args, ctx) => {
        const title = args?.trim();
        if (!title) {
          ctx.ui.notify("Usage: /pi-create <title>", "error");
          return;
        }
        const result = await apiPost(baseUrl, "/api/v1/control/tasks", {
          title,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        });
        if (!result || (result as Record<string, unknown>)["error"]) {
          ctx.ui.notify(`Failed to create task: ${(result as Record<string, unknown>)?.["error"] ?? "unknown"}`, "error");
          return;
        }
        const r = result as Record<string, unknown>;
        ctx.ui.notify(`Task created: ${r["task_id"]} — "${title}"`, "success");
      },
    });

    // /pi-run <task_id> <role> — start an agent run
    pi.registerCommand("pi-run", {
      description: "Start an agent run: /pi-run <task_id> <role>",
      handler: async (args, ctx) => {
        const parts = (args ?? "").trim().split(/\s+/);
        if (parts.length < 2) {
          ctx.ui.notify("Usage: /pi-run <task_id> <role>", "error");
          return;
        }
        const [task_id, agent_role] = parts;
        const result = await apiPost(baseUrl, "/api/v1/control/runs", {
          task_id, agent_role,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        }) as Record<string, unknown>;
        if (result?.["error"]) {
          ctx.ui.notify(`Error: ${result["error"]}`, "error");
          return;
        }
        ctx.ui.notify(`Run started: ${result?.["run_id"]} (${agent_role})`, "success");
        refreshStatus();
      },
    });

    // /pi-complete <run_id> [summary] — complete a run
    pi.registerCommand("pi-complete", {
      description: "Complete a run: /pi-complete <run_id> [output summary]",
      handler: async (args, ctx) => {
        const str = (args ?? "").trim();
        const spaceIdx = str.indexOf(" ");
        const run_id = spaceIdx === -1 ? str : str.slice(0, spaceIdx);
        const output_summary = spaceIdx === -1 ? "" : str.slice(spaceIdx + 1);
        if (!run_id) {
          ctx.ui.notify("Usage: /pi-complete <run_id> [summary]", "error");
          return;
        }
        await apiPost(baseUrl, `/api/v1/control/runs/${run_id}/complete`, {
          workspace_id: cfg.workspace_id,
          output_summary,
        });
        ctx.ui.notify(`Run ${run_id.slice(-8)} marked completed`, "success");
        refreshStatus();
      },
    });

    // /pi-block <run_id> <reason> — block a run
    pi.registerCommand("pi-block", {
      description: "Block a run: /pi-block <run_id> <reason>",
      handler: async (args, ctx) => {
        const str = (args ?? "").trim();
        const spaceIdx = str.indexOf(" ");
        if (spaceIdx === -1) {
          ctx.ui.notify("Usage: /pi-block <run_id> <reason>", "error");
          return;
        }
        const run_id = str.slice(0, spaceIdx);
        const reason = str.slice(spaceIdx + 1);
        await apiPost(baseUrl, `/api/v1/control/runs/${run_id}/block`, {
          workspace_id: cfg.workspace_id,
          reason,
        });
        ctx.ui.notify(`Run ${run_id.slice(-8)} blocked: ${reason}`, "warning");
        refreshStatus();
      },
    });

    // /pi-recall <query> — recall memories
    pi.registerCommand("pi-recall", {
      description: "Recall project memories: /pi-recall <query>",
      handler: async (args, ctx) => {
        const query = (args ?? "").trim();
        if (!query) {
          ctx.ui.notify("Usage: /pi-recall <query>", "error");
          return;
        }
        const data = await apiPost<{ memories: unknown[] }>(
          baseUrl,
          "/api/v1/control/memory/recall",
          { query, workspace_id: cfg.workspace_id, project_id: cfg.project_id, limit: 5 },
        );
        const mems = data?.memories ?? [];
        if (mems.length === 0) {
          ctx.ui.notify("No memories found", "info");
          return;
        }
        const lines = mems.map((m: unknown) => {
          const mem = m as Record<string, unknown>;
          const score = typeof mem["score"] === "number" ? ` (${(mem["score"] as number).toFixed(2)})` : "";
          return `  ${String(mem["content"] ?? "").slice(0, 80)}${score}`;
        });
        ctx.ui.notify(`Memories for "${query}":\n${lines.join("\n")}`, "info");
      },
    });

    // /cos <goal> — dispatch Chief of Staff
    pi.registerCommand("cos", {
      description: "Dispatch Chief of Staff: /cos <goal>",
      handler: async (args, ctx) => {
        const goal = (args ?? "").trim();
        if (!goal) {
          ctx.ui.notify("Usage: /cos <goal>", "error");
          return;
        }
        const data = await apiPost<{ context_markdown: string }>(
          baseUrl,
          "/api/v1/control/cos-context",
          { goal, project_id: cfg.project_id, workspace_id: cfg.workspace_id },
        );
        const md = data?.context_markdown ?? "";
        if (!md) {
          ctx.ui.notify("Could not build CoS context", "error");
          return;
        }
        // Inject world-state as a follow-up message that primes the CoS agent
        pi.sendMessage(
          {
            customType: "cos-context",
            content: `Chief of Staff context for goal: "${goal}"\n\n${md}`,
            display: true,
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
        ctx.ui.notify(`CoS context injected for: "${goal}"`, "success");
      },
    });

    // /pi-workspaces — list workspaces
    pi.registerCommand("pi-workspaces", {
      description: "List all PI Agent OS workspaces",
      handler: async (_args, ctx) => {
        const data = await apiGet<{ workspaces: unknown[] }>(baseUrl, "/api/v1/control/workspaces");
        const ws = data?.workspaces ?? [];
        if (ws.length === 0) {
          ctx.ui.notify("No workspaces found — have you run pi-os workspace create?", "info");
          return;
        }
        const lines = ws.map((w: unknown) => {
          const item = w as Record<string, unknown>;
          const active = item["workspace_id"] === cfg.workspace_id ? " ← active" : "";
          return `  ${item["workspace_id"]}  ${item["name"]}${active}`;
        });
        ctx.ui.notify(`Workspaces:\n${lines.join("\n")}`, "info");
      },
    });
  }

  // ── LLM-callable tools ──────────────────────────────────────────────────────

  function registerTools(): void {
    // List tasks
    pi.registerTool({
      name: "pi_os_list_tasks",
      description: "List PI Agent OS tasks for the current workspace/project.",
      parameters: Type.Object({
        status: Type.Optional(Type.String({ description: "Filter: queued|in_progress|completed|blocked" })),
        limit: Type.Optional(Type.Number({ description: "Max results (default 20)" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const qs = new URLSearchParams({ workspace_id: cfg.workspace_id });
        if (cfg.project_id) qs.set("project_id", cfg.project_id);
        if (args.status) qs.set("status", args.status);
        if (args.limit) qs.set("limit", String(args.limit));
        const data = await apiGet<{ tasks: unknown[] }>(baseUrl, `/api/v1/control/tasks?${qs}`);
        return { content: [{ type: "text", text: JSON.stringify(data?.tasks ?? [], null, 2) }] };
      },
    });

    // Create task
    pi.registerTool({
      name: "pi_os_create_task",
      description: "Create a new task in the PI Agent OS control plane.",
      parameters: Type.Object({
        title: Type.String({ description: "Task title" }),
        description: Type.Optional(Type.String({ description: "Task description" })),
        priority: Type.Optional(Type.String({ description: "low|medium|high|critical" })),
        assigned_to: Type.Optional(Type.String({ description: "Agent role to assign" })),
        done_criteria: Type.Optional(Type.String({ description: "Definition of done" })),
      }),
      execute: async (_id, args, _sig, _upd, ctx) => {
        const result = await apiPost(baseUrl, "/api/v1/control/tasks", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        });
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Update task
    pi.registerTool({
      name: "pi_os_update_task",
      description: "Update a task's status, add a blocker note, or reassign it.",
      parameters: Type.Object({
        task_id: Type.String({ description: "Task ID (tsk_...)" }),
        status: Type.Optional(Type.String({ description: "New status" })),
        note: Type.Optional(Type.String({ description: "Blocker note to append" })),
        assigned_to: Type.Optional(Type.String({ description: "New agent role" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const { task_id, ...body } = args;
        const result = await apiPatch(baseUrl, `/api/v1/control/tasks/${task_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Recall memory
    pi.registerTool({
      name: "pi_os_recall_memory",
      description: "Recall relevant memories from the PI Agent OS memory store.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        limit: Type.Optional(Type.Number({ description: "Max results" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost<{ memories: unknown[] }>(
          baseUrl,
          "/api/v1/control/memory/recall",
          { query: args.query, workspace_id: cfg.workspace_id, project_id: cfg.project_id, limit: args.limit ?? 10 },
        );
        return { content: [{ type: "text", text: JSON.stringify(result?.memories ?? [], null, 2) }] };
      },
    });

    // Write memory
    pi.registerTool({
      name: "pi_os_write_memory",
      description: "Persist a note to the PI Agent OS project memory store.",
      parameters: Type.Object({
        content: Type.String({ description: "Memory content to store" }),
        title: Type.Optional(Type.String({ description: "Memory title" })),
        tags: Type.Optional(Type.String({ description: "Comma-separated tags" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost(baseUrl, "/api/v1/control/memory/write", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Start run
    pi.registerTool({
      name: "pi_os_start_run",
      description: "Register a new PI agent run in the control plane.",
      parameters: Type.Object({
        task_id: Type.String({ description: "Task being worked on" }),
        agent_role: Type.String({ description: "Agent role (implementer, tester, reviewer, etc.)" }),
        worktree_path: Type.Optional(Type.String({ description: "Git worktree path" })),
        pi_run_id: Type.Optional(Type.String({ description: "Use a specific run ID" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost(baseUrl, "/api/v1/control/runs", {
          ...args,
          workspace_id: cfg.workspace_id,
          project_id: cfg.project_id,
        });
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Heartbeat
    pi.registerTool({
      name: "pi_os_heartbeat",
      description: "Send a heartbeat for an active PI agent run (call every ~30s).",
      parameters: Type.Object({
        run_id: Type.String({ description: "Run ID" }),
        current_step: Type.Optional(Type.String({ description: "What the agent is doing now" })),
        progress_pct: Type.Optional(Type.Number({ description: "Progress 0–100" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const { run_id, ...body } = args;
        const result = await apiPost(baseUrl, `/api/v1/control/runs/${run_id}/heartbeat`, {
          workspace_id: cfg.workspace_id, ...body,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Complete run
    pi.registerTool({
      name: "pi_os_complete_run",
      description: "Mark a PI agent run as completed.",
      parameters: Type.Object({
        run_id: Type.String({ description: "Run ID" }),
        output_summary: Type.Optional(Type.String({ description: "Summary of what was done" })),
        artifact_paths: Type.Optional(Type.String({ description: "Comma-separated artifact paths" })),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const { run_id, ...body } = args;
        const result = await apiPost(baseUrl, `/api/v1/control/runs/${run_id}/complete`, {
          workspace_id: cfg.workspace_id, ...body,
        });
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Block run
    pi.registerTool({
      name: "pi_os_block_run",
      description: "Mark a PI agent run as blocked with a reason.",
      parameters: Type.Object({
        run_id: Type.String({ description: "Run ID" }),
        reason: Type.String({ description: "Why the agent is blocked" }),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost(baseUrl, `/api/v1/control/runs/${args.run_id}/block`, {
          workspace_id: cfg.workspace_id, reason: args.reason,
        });
        refreshStatus();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    // Workspace status
    pi.registerTool({
      name: "pi_os_workspace_status",
      description: "Get a full workspace status snapshot: active runs, blockers, WIP, queue depth.",
      parameters: Type.Object({}),
      execute: async (_id, _args, _sig, _upd, _ctx) => {
        await refreshStatus();
        return {
          content: [{
            type: "text",
            text: snapshot ? JSON.stringify(snapshot, null, 2) : "No status available",
          }],
        };
      },
    });

    // CoS context
    pi.registerTool({
      name: "pi_os_build_cos_context",
      description: "Build a world-state snapshot for the Chief of Staff agent.",
      parameters: Type.Object({
        goal: Type.String({ description: "The goal to plan for" }),
      }),
      execute: async (_id, args, _sig, _upd, _ctx) => {
        const result = await apiPost<{ context_markdown: string }>(
          baseUrl,
          "/api/v1/control/cos-context",
          { goal: args.goal, project_id: cfg.project_id, workspace_id: cfg.workspace_id },
        );
        return {
          content: [{ type: "text", text: result?.context_markdown ?? "Could not build CoS context" }],
        };
      },
    });
  }

  // ── Policy hook ─────────────────────────────────────────────────────────────

  function registerPolicyHook(): void {
    pi.on("tool_call", async (event, _ctx) => {
      if (serverState !== "up") return;
      // Only enforce policy for non-pi-os tools (avoid infinite loops)
      const toolName: string = (event as unknown as { toolName?: string }).toolName ?? "";
      if (toolName.startsWith("pi_os_") || toolName.startsWith("mcp__pi-os__")) return;

      const input: unknown = (event as unknown as { input?: unknown }).input ?? {};
      const check = await apiPost<{ allowed: boolean; reason: string }>(
        baseUrl,
        "/api/v1/control/policy/check",
        {
          action: `tool_use:${toolName}`,
          resource: toolName,
          actor_id: "pi",
          workspace_id: cfg.workspace_id,
          actor_type: "agent",
          extra: input as Record<string, unknown>,
        },
      );
      if (check && !check.allowed) {
        return { block: true, reason: `[pi-os policy] ${check.reason}` };
      }
    });
  }

  // ── Session lifecycle ────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    widgetCtx = ctx;
    cfg = loadConfig(ctx.cwd ?? process.cwd());
    baseUrl = `http://127.0.0.1:${cfg.monitor_port}`;

    registerWidgets(ctx);
    registerCommands();
    registerTools();
    registerPolicyHook();

    // Start server (non-blocking)
    startServer(ctx);

    // Poll every 5s
    pollTimer = setInterval(() => {
      if (serverState === "up") refreshStatus();
    }, 5000);

    if (!cfg.workspace_id) {
      ctx.ui.notify(
        "PI Agent OS: no workspace_id configured.\n" +
        "Create .pi-os.json in your project root:\n" +
        '  { "workspace_id": "ws_...", "project_id": "proj_..." }',
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    stopServer();
  });
}
