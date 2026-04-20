import { type Plugin, tool } from "@opencode-ai/plugin"
import { spawnSync } from "child_process"
import { loadRider } from "./rider.js"

// v2a Task 50: in-plugin allowlist. Must match Task 29 / 30 write-side
// allowlist (Write/Edit/MultiEdit/NotebookEdit/Bash/Task). Tools not here
// never reach `fulcrum hook auto`.
const FULCRUM_TOOL_ALLOWLIST = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task"])

// ── CLI bridge ────────────────────────────────────────────────────────────────
// All Fulcrum operations go through `fulcrum action exec <name> [--json '...']`
// so the plugin works without the monitor server running.

function execAction(name: string, args?: Record<string, unknown>): unknown {
  const argv = ["action", "exec", name]
  if (args && Object.keys(args).length > 0) {
    argv.push("--json", JSON.stringify(args))
  }
  const result = spawnSync("fulcrum", argv, {
    encoding: "utf-8",
    timeout: 10_000,
  })
  if (result.error || result.status !== 0) {
    const msg = result.stderr?.trim() || result.error?.message || `exit ${result.status}`
    throw new Error(`fulcrum ${name}: ${msg}`)
  }
  try {
    return JSON.parse(result.stdout ?? "null")
  } catch {
    return result.stdout?.trim() ?? null
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const FulcrumPlugin: Plugin = async (ctx) => {
  // Context from workspace — auto-detected from CWD at runtime
  let _cachedCtx: { workspace_id: string; project_id: string } | null = null

  // Load the canonical rider + integrity check at plugin init. Logged once;
  // subsequent injections reuse the same buffer.
  const riderLoad = loadRider()
  let experimentalFiredCount = 0
  let messagesTransformFiredCount = 0

  // PR 4 closeout c4 — track whether we've written the Fulcrum session-trust
  // file for this opencode session. The bias nudge in `fulcrum hook opencode
  // pre` validates session_id against agent_runs (AD-9b) before logging any
  // counter, so we must start the run / write the trust file on the first
  // tool.execute.before observation. Fire-and-forget; idempotent server-side.
  const sessionStarted = new Set<string>()
  function ensureSessionStart(sessionId: string): void {
    if (!sessionId || sessionId === "unknown" || sessionStarted.has(sessionId)) return
    sessionStarted.add(sessionId)
    spawnSync("fulcrum", ["hook", "opencode", "session-start"], {
      input: JSON.stringify({ session_id: sessionId }),
      encoding: "utf-8",
      timeout: 5_000,
    })
  }

  function getContext(): { workspace_id: string; project_id: string } {
    if (_cachedCtx) return _cachedCtx
    try {
      const r = execAction("get_current_context") as Record<string, unknown>
      _cachedCtx = {
        workspace_id: r["workspace_id"] as string,
        project_id: r["project_id"] as string,
      }
    } catch {
      _cachedCtx = { workspace_id: "default", project_id: "default" }
    }
    return _cachedCtx
  }

  return {
    // ── System context injection (before every LLM call) ───────────────────
    // Injects workspace snapshot so the agent sees live state without
    // needing to call status tools manually.

    "experimental.chat.system.transform": async (_input, output) => {
      // Prepend the canonical rider (fulcrum-first + lifecycle + role-boundaries).
      // Fenced <fulcrum-system-rider> block so downstream model tooling can
      // detect and parse it. Integrity status from the startup load is
      // advisory — AD-3 says fail-open on mismatch so we continue with the
      // best-effort rider regardless. Signature follows @opencode-ai/plugin
      // ≥1.14 — the hook receives (input, output) and mutates output.system[].
      experimentalFiredCount++

      if (riderLoad.rider) {
        const header = `<fulcrum-system-rider version="1" sha256="${riderLoad.sha256.slice(0, 12)}" integrity="${
          riderLoad.integrityOk ? "ok" : "warn"
        }">`
        output.system.unshift(`${header}\n${riderLoad.rider}\n</fulcrum-system-rider>`)
      }

      // Append live workspace snapshot (existing behavior; pushed as a
      // separate system-prompt segment now that output.system is string[]).
      try {
        const ids = getContext()
        const status = execAction("get_workspace_status", { workspace_id: ids.workspace_id }) as Record<string, unknown>
        const active = (status["active_runs"] as unknown[]) ?? []
        const blocked = (status["blocked_runs"] as unknown[]) ?? []
        if (active.length === 0 && blocked.length === 0) return

        const lines = [`<!-- Fulcrum workspace: ${ids.workspace_id} -->`]
        if (active.length > 0) lines.push(`Active agent runs: ${active.length}`)
        if (blocked.length > 0) lines.push(`⚠ Blocked runs: ${blocked.length}`)
        output.system.push(lines.join("\n"))
      } catch { /* best-effort */ }
    },

    // PR 4 closeout c5 — AD-3 belt-and-suspenders redundancy. Both
    // experimental.* hooks register together and opencode fires both per
    // LLM call; ordering between them is not guaranteed. If
    // system.transform has already mutated output.system[] this turn
    // (experimentalFiredCount > 0), we skip to avoid duplicating rider
    // content in the prompt. If it hasn't (future SDK change silently
    // drops system[] mutations, or messages.transform fires first with
    // no system.transform yet this session), we prepend the rider as a
    // synthetic TextPart on the first existing user message so the
    // model still sees it via the conversation stream.
    "experimental.chat.messages.transform": async (_input, output) => {
      messagesTransformFiredCount++
      if (experimentalFiredCount > 0) return
      if (!riderLoad.rider || output.messages.length === 0) return
      const first = output.messages[0]
      if (!first) return
      const riderPart = {
        id: `fulcrum-rider-${Date.now()}`,
        sessionID: first.info.sessionID,
        messageID: first.info.id,
        type: "text" as const,
        text: `<fulcrum-system-rider fallback="messages.transform" sha256="${riderLoad.sha256.slice(0, 12)}">\n${riderLoad.rider}\n</fulcrum-system-rider>`,
        synthetic: true,
      }
      first.parts.unshift(riderPart)
    },

    // ── Shell environment ──────────────────────────────────────────────────
    // Inject IDs so subprocesses can find the workspace without reading files.

    "shell.env": async (_input, output) => {
      try {
        const ids = getContext()
        output.env["FULCRUM_WORKSPACE_ID"] = ids.workspace_id
        output.env["FULCRUM_PROJECT_ID"] = ids.project_id
      } catch { /* best-effort */ }
    },

    // ── Pre-tool policy check ──────────────────────────────────────────────
    //
    // v2a Task 50: in-plugin allowlist runs BEFORE shelling to `fulcrum hook
    // auto`. Read / Glob / Grep (and everything else) never produce a hook
    // shell-out — matches AC §11.64 / §11.68.

    "tool.execute.before": async (input) => {
      // Always bootstrap the trust file on first observation so the bias
      // nudge has something to validate against. Cheap once per session.
      const sessionId = input.sessionID ?? process.env["OPENCODE_SESSION_ID"] ?? "unknown"
      ensureSessionStart(sessionId)

      // Every tool call shells to `fulcrum hook opencode pre`. The CLI-side
      // hook opens the bias nudge + recall-counter paths for opencode (see
      // packages/cli/src/hooks.ts §3a/§3b). The allowlist below still applies
      // to the write-side policy check, but search tools (Grep/Glob/Read) now
      // route through the hook unconditionally so the nudge can fire.
      const searchTool = input.tool === "Grep" || input.tool === "Glob" || input.tool === "Read"
      if (!input.tool || input.tool.startsWith("fulcrum_")) return
      if (!FULCRUM_TOOL_ALLOWLIST.has(input.tool) && !searchTool) return

      const result = spawnSync("fulcrum", ["hook", "opencode", "pre"], {
        input: JSON.stringify({
          tool_name: input.tool,
          tool_input: input.input ?? {},
          session_id: sessionId,
        }),
        encoding: "utf-8",
        timeout: 5_000,
      })

      if (result.status !== 0 && result.status !== null) {
        // Hook returned non-zero → block
        let reason = "denied by Fulcrum policy"
        try {
          const out = JSON.parse(result.stdout ?? "{}") as Record<string, unknown>
          if (typeof out["message"] === "string") reason = out["message"]
          else if (typeof out["reason"] === "string") reason = out["reason"]
        } catch { /* use default reason */ }
        throw new Error(`[fulcrum policy] ${reason}`)
      }
    },

    // ── Post-tool trace ────────────────────────────────────────────────────

    "tool.execute.after": async (input) => {
      if (!input.tool || input.tool.startsWith("fulcrum_")) return
      if (!FULCRUM_TOOL_ALLOWLIST.has(input.tool)) return
      const sessionId = input.sessionID ?? process.env["OPENCODE_SESSION_ID"] ?? "unknown"
      spawnSync("fulcrum", ["hook", "opencode", "post"], {
        input: JSON.stringify({
          tool_name: input.tool,
          tool_input: input.args ?? {},
          session_id: sessionId,
        }),
        encoding: "utf-8",
        timeout: 5_000,
      })
    },

    // ── Permission gate ────────────────────────────────────────────────────

    "permission.ask": async (input) => {
      // Use the same pre-hook policy check for permission gating
      const result = spawnSync("fulcrum", ["hook", "auto"], {
        input: JSON.stringify({
          tool_name: input.tool ?? "unknown",
          tool_input: input.input ?? {},
          session_id: process.env["OPENCODE_SESSION_ID"] ?? "unknown",
        }),
        encoding: "utf-8",
        timeout: 5_000,
      })
      if (result.status !== 0 && result.status !== null) {
        let reason = "denied by Fulcrum policy"
        try {
          const out = JSON.parse(result.stdout ?? "{}") as Record<string, unknown>
          if (typeof out["message"] === "string") reason = out["message"]
        } catch { /* use default */ }
        return { approved: false, reason }
      }
      return { approved: true }
    },

    // ── Event subscriptions ────────────────────────────────────────────────
    // v2a Task 48 + v2b PR 17 Task 8.4:
    // - session.idle → session-summary write
    // - session.compacted → pre_compact_extract memory + graph reducer write
    // - todo.updated (v2b) → mirror into Fulcrum tasks table

    "event": async (input) => {
      if (!input || typeof input !== "object") return
      const event = input as Record<string, unknown>
      const name = event["type"] as string | undefined
      const sessionId = process.env["OPENCODE_SESSION_ID"] ?? "unknown"

      if (name === "session.idle") {
        spawnSync("fulcrum", ["hook", "opencode", "session-end"], {
          input: JSON.stringify({ session_id: sessionId }),
          encoding: "utf-8",
          timeout: 5_000,
        })
        // AD-3 fallback signal: if experimental.chat.system.transform never
        // fired this session, the rider didn't reach the model. Log a
        // telemetry event so the measurement harness can detect silent
        // primary-path failures and route through opencode.md (second ground
        // truth) on the next session. Never throws; best-effort.
        if (experimentalFiredCount === 0 && riderLoad.rider) {
          try {
            spawnSync("fulcrum", ["action", "exec", "emit_graph_event", "--json", JSON.stringify({
              event_type: "opencode_rider_never_injected",
              session_id: sessionId,
              rider_sha256: riderLoad.sha256,
              rule_count: riderLoad.ruleCount,
            })], { encoding: "utf-8", timeout: 2_000 })
          } catch { /* best-effort */ }
        }
      } else if (name === "session.compacted") {
        // Emit pre_compact_extract memory
        spawnSync("fulcrum", ["hook", "opencode", "pre-compact"], {
          input: JSON.stringify({ session_id: sessionId }),
          encoding: "utf-8",
          timeout: 5_000,
        })
        // Fire graph reducer write (team_instantiated-style event bus write)
        try {
          const ids = getContext()
          spawnSync("fulcrum", ["action", "exec", "emit_graph_event", "--json", JSON.stringify({
            event_type: "session_compacted",
            session_id: sessionId,
            workspace_id: ids.workspace_id,
          })], { encoding: "utf-8", timeout: 5_000 })
        } catch { /* best-effort */ }
      } else if (name === "todo.updated") {
        // v2b PR 17 Task 8.4: mirror todo changes into Fulcrum tasks table
        const todo = event["todo"] as Record<string, unknown> | undefined
        if (!todo) return
        try {
          spawnSync("fulcrum", ["action", "exec", "update_task", "--json", JSON.stringify({
            task_id: todo["id"],
            status: todo["status"],
            note: `[opencode todo.updated] ${todo["title"] ?? ""}`,
          })], { encoding: "utf-8", timeout: 5_000 })
        } catch { /* best-effort */ }
      }
    },

    // ── Custom tools ────────────────────────────────────────────────────────

    tool: {
      fulcrum_workspace_status: tool({
        description: "Get Fulcrum workspace status: active agent runs, blockers, and WIP count",
        args: {},
        async execute() {
          const ids = getContext()
          const result = execAction("get_workspace_status", { workspace_id: ids.workspace_id })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_list_tasks: tool({
        description: "List Fulcrum tasks for the current workspace and project",
        args: {
          status: tool.schema.string().optional().describe("Filter: queued | running | blocked | completed"),
          limit: tool.schema.number().optional().describe("Max results (default 20)"),
        },
        async execute(args) {
          const ids = getContext()
          const result = execAction("list_tasks", {
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
            ...(args.status ? { status: args.status } : {}),
            ...(args.limit ? { limit: args.limit } : {}),
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_create_task: tool({
        description: "Create a new task in the Fulcrum control plane",
        args: {
          title: tool.schema.string().describe("Task title"),
          description: tool.schema.string().optional().describe("Task description"),
          priority: tool.schema.string().optional().describe("low | medium | high | critical"),
          assigned_to: tool.schema.string().optional().describe("Agent role slug (e.g. software_engineer)"),
          done_criteria: tool.schema.string().optional().describe("Definition of done"),
        },
        async execute(args) {
          const ids = getContext()
          const result = execAction("create_task", {
            ...args,
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_recall_memory: tool({
        description: "Search Fulcrum project memory with hybrid semantic search (FTS5 + vector). Use before making architectural decisions.",
        args: {
          query: tool.schema.string().describe("Natural-language search query"),
          limit: tool.schema.number().optional().describe("Max results (default 10)"),
        },
        async execute(args) {
          const ids = getContext()
          const result = execAction("recall_memory", {
            query: args.query,
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
            limit: args.limit ?? 10,
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_write_memory: tool({
        description: "Persist a note to Fulcrum project memory for future recall. Use after key decisions or discoveries.",
        args: {
          content: tool.schema.string().describe("Memory content (plain text)"),
          title: tool.schema.string().optional().describe("Memory title"),
          tags: tool.schema.string().optional().describe("Comma-separated tags, e.g. decision,architecture"),
        },
        async execute(args) {
          const ids = getContext()
          const tags = args.tags ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []
          const result = execAction("write_memory", {
            content: args.content,
            ...(args.title ? { title: args.title } : {}),
            ...(tags.length > 0 ? { tags } : {}),
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_start_run: tool({
        description: "Register an agent run in Fulcrum. Call this at the start of every task. Returns run_id for heartbeat and completion calls.",
        args: {
          agent_role: tool.schema.string().describe("Your role, e.g. software_engineer or chief_of_staff"),
          task_id: tool.schema.string().optional().describe("Task ID (tsk_...) — auto-creates stub if omitted"),
        },
        async execute(args) {
          const ids = getContext()
          const result = execAction("start_agent_run", {
            ...args,
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_heartbeat: tool({
        description: "Send a heartbeat for an active agent run. Call every ~30 s during long tasks.",
        args: {
          run_id: tool.schema.string().describe("Run ID from fulcrum_start_run"),
          current_step: tool.schema.string().optional().describe("Current step description"),
          progress_pct: tool.schema.number().optional().describe("Progress 0–100"),
        },
        async execute(args) {
          const result = execAction("heartbeat_agent_run", args)
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_complete_run: tool({
        description: "Mark a Fulcrum agent run as completed. Call when your task is done.",
        args: {
          run_id: tool.schema.string().describe("Run ID from fulcrum_start_run"),
          output_summary: tool.schema.string().optional().describe("Summary of what was accomplished"),
          artifact_paths: tool.schema.string().optional().describe("Comma-separated file paths changed"),
        },
        async execute(args) {
          const paths = args.artifact_paths
            ? args.artifact_paths.split(",").map((p: string) => p.trim()).filter(Boolean)
            : []
          const result = execAction("complete_agent_run", {
            run_id: args.run_id,
            ...(args.output_summary ? { output_summary: args.output_summary } : {}),
            ...(paths.length > 0 ? { artifact_paths: paths } : {}),
          })
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_block_run: tool({
        description: "Mark a Fulcrum agent run as blocked. Use when you need human input to continue.",
        args: {
          run_id: tool.schema.string().describe("Run ID from fulcrum_start_run"),
          reason: tool.schema.string().describe("Why you are blocked and what is needed to unblock"),
        },
        async execute(args) {
          const result = execAction("block_agent_run", args)
          return JSON.stringify(result, null, 2)
        },
      }),

      fulcrum_build_cos_context: tool({
        description: "Build a Chief-of-Staff world-state snapshot with active tasks, running agents, and blockers.",
        args: {
          goal: tool.schema.string().optional().describe("The planning goal for this CoS invocation"),
        },
        async execute(args) {
          const ids = getContext()
          const result = execAction("build_cos_context", {
            workspace_id: ids.workspace_id,
            project_id: ids.project_id,
            ...(args.goal ? { goal: args.goal } : {}),
          })
          return JSON.stringify(result, null, 2)
        },
      }),
    },
  }
}

export default FulcrumPlugin
