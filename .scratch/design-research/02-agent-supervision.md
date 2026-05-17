# 02 — Agent Supervision UX, ACP-style Live Sessions, and Multi-Agent Orchestration

**Cluster:** agent supervision UX, ACP-style live sessions, tool-call display, run feeds, approval gates, multi-agent orchestration.
**Audience:** Fulcrum design / engineering — Live Session pane, Run Feed, Multi-Agent Orchestrator (web), Orchestrator pane (TUI), `fulcrum runs feed --watch` (CLI), event-stream API schema.

This document maps the supervision-UX design space across thirteen products that move the state of the art, then translates the patterns into concrete recommendations for Fulcrum's web, TUI, CLI, and API surfaces.

---

## 1. Devin (Cognition) — autonomous agent with workspace tools

Devin operates as a managed VM that gets a prompt and returns a PR. Its session UI exposes a **Shell** ("Devin's terminal, where you can watch commands being executed"), an **IDE** ("Devin's embedded code editor equipped with all the IDE tools"), and a **Browser** for testing applications and navigating documentation [1]. The three workspace tools live on the right of the session; the transcript / activity stream lives in the middle column. The session is the unit of work — sessions are listed in a panel, with status displayed inline so users "monitor progress without leaving the page" while iterating in **Ask Devin** [2].

**Phases & verification.** Devin self-validates by running tests and responding to code-review feedback without interruption [3]. The official guideline is that tasks of "3 hours or less" with test suites, lint, or compilation are best [3]. Devin's review flow ("Devin Review") groups diff changes by logical relatedness rather than alphabetically, detects copied/moved code, and presents a **Bug Catcher** that classifies findings as Bugs (severe/non-severe) or Flags (investigate/informational) [4]. **Auto-Fix** suggests changes alongside bug findings; users review and apply them as a commit "without leaving Devin Review" [4]. Comments can be batched into a pending review, mirroring GitHub.

**Parallelism & coordination.** Devin can "break down a large task and delegate pieces to a team of managed Devin sessions, each running in its own isolated VM," with the coordinator monitoring progress and compiling results across workstreams [5]. **Playbooks** turn successful sessions into reusable workflows; **Knowledge** management lets teams deduplicate and consolidate; **MCP integrations** expose every capability programmatically; **Scheduled sessions** allow recurring runs [5]. Slack/Teams `@Devin` tags hand off chats to sessions directly [6].

**Cost.** ACU economics are not described in the public docs we crawled [3]; the consumption signal is implicit (session count, scheduled runs).

## 2. Anthropic — effective harnesses for long-running agents

Anthropic's engineering post on long-running harnesses defines the canonical "initializer + coding agent" split. The initializer runs once at project start and writes three artifacts: an `init.sh` script, a `claude-progress.txt` activity log, and an initial git commit documenting the seed [7]. Every subsequent **coding agent** session is prompted to "make incremental progress" and "leave the environment in a clean state." Continuity is preserved by three orthogonal mechanisms: (1) the progress file acts as a session bridge, (2) git history is the authoritative incremental record, (3) a JSON feature list with `passes: true|false` prevents premature "done" claims [7]. Each session boots with `pwd`, reads git log + progress file, picks the highest-priority unfinished feature, and runs `init.sh` to verify the dev environment [7]. End-to-end verification uses browser automation (Puppeteer via MCP) "as users would," not just unit tests.

**Claude Agent SDK** exposes the same loop programmatically: built-in tools (`Read`, `Write`, `Edit`, `Bash`, `Monitor`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `AskUserQuestion`), `PreToolUse` / `PostToolUse` / `SessionStart` / `SessionEnd` hooks, **subagents** with `parent_tool_use_id` linkage so messages can be attributed to a specific subagent execution, MCP servers, and a streaming `query()` that yields typed messages (`SystemMessage{subtype:'init'}` carries `session_id`, `ResultMessage` carries the final `result`) [8]. Sessions can be **resumed** by `session_id` and **forked** to explore branches.

## 3. Cursor — Agent / Composer / Background Agent

Cursor's Agent runs at `Cmd+I`, with three architectural components (instructions, tools, model). It exposes **Checkpoints** — local snapshots of the codebase taken before significant changes, "stored locally and separate from Git," meant only for undoing Agent changes [9]. **Queued messages** let users stack follow-up instructions that run sequentially after the current task completes [9].

**Background / Cloud Agents** run in isolated cloud VMs, parallelizing tasks without local connectivity, building and testing the changed software with browser/desktop automation, and emitting **merge-ready pull requests with artifacts (screenshots, videos, logs)** [10]. Environments come from agent-led setup, saved snapshots, or `Dockerfile` declared in `.cursor/environment.json`. Access points: `cursor.com/agents` (web), Desktop "Cloud" dropdown, Slack, GitHub, Linear, API. Billing follows API pricing for the selected model with a spend limit set on first use; cloud agents always operate in Max Mode [10].

The May 2026 changelog adds **Build in Parallel** (async subagents), a `/multitask` slash command for parallelizing requests, a **Context Usage Breakdown** showing agent context consumption, and **multi-repo environments** [11]. Cursor's TUI integration with Microsoft Teams lets users delegate to cloud agents from chat [11].

## 4. Claude Code — terminal/IDE agentic coder

Claude Code is "available in your terminal, IDE, desktop app, and browser" with the same engine across surfaces; `CLAUDE.md`, settings, and MCP servers travel with the user [12]. The desktop app's tagline is the supervision shape we care about: "Review diffs visually, run multiple sessions side by side, schedule recurring tasks, and kick off cloud sessions" [12]. **VS Code extension** ships "inline diffs, @-mentions, plan review, and conversation history directly in your editor." **Multiple Claude Code agents** ("sub-agents") work on different parts of a task simultaneously with a lead coordinating; **background agents** ("agent-view") let several full sessions run in parallel "from one screen" [12]. **Skills** are markdown files at `.claude/skills/<name>/SKILL.md` invoked by Claude automatically or by typing `/skill-name`; they support `disable-model-invocation`, `allowed-tools`, `context: fork`, and a `paths` glob limiter [13]. Dynamic context injection via `` !`<command>` `` runs shell commands before the skill content is sent, so Claude receives live data [13]. The skill listing budget is `1%` of context by default and overflow drops least-used descriptions first — a deliberate cost-control affordance [13].

## 5. Codex CLI (OpenAI) — terminal-first agent

Codex launches a full-screen terminal UI: users "send prompts, code snippets, or screenshots directly into the composer" and "watch Codex explain its plan before making changes" [14]. Approval modes are explicit: **Auto** (default, file ops + commands in working dir), **Read-only** (browse only, ask for changes), **Full Access** (unrestricted machine + network) [14]. Slash commands include `/review` (inspect diffs vs. a base branch or commit), `/theme`, `/model`. Resume is first-class: `codex resume` or `codex resume --last`. Non-interactive mode is `codex exec "<task>"`. Remote TUI mode connects to a remote app server over WebSocket with capability tokens. Web search is on by default; `--search` for live; images via `-i` or paste [14]. Subagents are explicitly requested via commands ("explicitly requested via commands"), and MCP support is configured for external tools.

## 6. Aider — git-native pair programming

Aider's signal contribution to supervision UX is **a git commit per accepted edit** [15]. Every change is automatically committed, making `/undo` cheap and bisect trivial. In-chat commands shape the conversation: `/add`, `/drop`, `/run`, `/undo`, `/diff` [15]. Voice-to-code, image and webpage processing, prompt caching, IDE integration, and browser chat are all supported. Diffs are shown visually before acceptance. The `/model` command switches models mid-session.

## 7. Replit Agent — three-tier autonomy with Plan mode

Replit Agent transforms NL descriptions into running apps and exposes three operating tiers — **Lite** (10–60s changes), **Economy** (general purpose), **Power** (most capable, optional **Turbo** for Pro) [16]. **Plan mode** lets users "brainstorm, ask questions, and map out your project before Agent changes any code or data," breaking complex projects into reviewable task lists [16]. The IDE bundles the embedded shell, file tree, run preview, and transcript in one workspace.

## 8. Linear for Agents — agents as workspace members

Linear treats agents as first-class teammates with explicit accountability: "the human user remains the primary assignee, while the agent is added as a contributor" so accountability chains stay clean [17]. Agents are assigned to issues, added to projects, or `@`-mentioned in comments. They handle "multiple issues simultaneously" — humans select tasks, assign the agent, and watch the issues move. Crucially: users can "understand every change they make at a glance — or go deeper and inspect the underlying reasoning," preventing black-box operations [17]. The ecosystem includes Cursor (issue → PR), Sentry (root-cause), ChatPRD (requirements).

## 9. LangSmith / LangGraph Studio — observability + agent IDE

LangSmith organizes observability hierarchically: **Projects** → **Traces** (group runs from one operation, max 25k runs/trace) → **Runs** (individual units of work like LLM calls or retrievals) → **Threads** (linking traces from multi-turn conversations via a shared identifier) [18]. Feedback scoring, tags, and key-value metadata enrich each run. **LangGraph Studio** is "a specialized agent IDE that enables visualization, interaction, and debugging of agentic systems that implement the Agent Server API protocol" [19]. It supports **time-travel debugging**, state inspection, two views (Graph mode = full execution detail; Chat mode = simple agent testing), and dataset-driven experimentation [19].

## 10. Temporal Web UI — durable workflow supervision

Temporal Web UI displays "Workflow Execution state and metadata for debugging" [20]. Workflows are filterable by status, ID, type, timestamp, and **custom search attributes**. Users save up to 20 filtered views. A **Task Failures View** auto-flags workflows with five consecutive task failures. **Event History** displays ~40 event types in chronological order, with **timeline / compact / JSON** view toggles and JSON download [20]. From the UI, users can **cancel, signal, update, reset, terminate, or start new executions with pre-filled values** — concretely: every supervision verb is one click. Additional panes show parent/child relationships, active workers, pending activities, call stacks, queries, and metadata.

## 11. Argo Workflows + Dagster — DAG visualization for orchestration

Argo Workflows ships a UI to "visualize and manage Workflows" with DAG visualization, color-coded node status indicators, integrated log viewing, retry of failed steps, and template management — plus REST + gRPC for programmatic access, workflow archiving, cron scheduling, and suspend/resume [21]. Dagster's webserver lists assets with filters by key/compute kind/group/tags, shows global lineage, and renders runs as **Gantt charts with structured event logs and raw compute logs** [22]. Schedules and sensors have dedicated pages with tick history and preview testing.

## 12. Airflow UI — task-instance retry & mark-success

Airflow 3.2.1 centres on **Grid View** ("the primary interface for inspecting Dag runs and task states" — rows are tasks, columns are runs) and **Graph View** (task dependencies + skipped-task explanations) [23]. **Task Instance View** shows logs, rendered templates, XCom values, and execution metadata. From the UI users can **mark tasks successful, failed, or cleared** and trigger backfills via a window that accepts past dates [23]. Asset views surface lineage; the admin panel handles variables, connections, pools.

## 13. Agent Client Protocol (ACP) — the missing standard

ACP is the Zed-led editor↔agent protocol that gives Fulcrum the right vocabulary [24][25]. **Architecture:** local agents = JSON-RPC over stdio sub-processes; remote agents = HTTP or WebSocket (in progress) [24]. **Methods (verbatim)** [25]:

- `initialize` — negotiate versions and exchange capabilities
- `authenticate` — perform auth when required
- `session/new` — create a fresh session (working directory + MCP server list → unique session id)
- `session/load` — restore previous conversation by replaying the entire history as `session/update` notifications (capability-gated)
- `session/resume` — reconnect without replay
- `session/prompt` — send user message
- `session/cancel` — one-way notification, no response expected
- `session/update` — agent→client notification carrying message content, tool ops, planning data, command availability, mode transitions
- `session/request_permission` — agent asks client to authorize tool execution

**`session/update` kinds (verbatim)** [26]: `plan`, `agent_message_chunk`, `tool_call`, `tool_call_update`, `available_commands_update`, `current_mode_update`. **Tool-call status lifecycle**: `pending` → `in_progress` → `completed` → `failed` [26]. **Content blocks** [27]: `text`, `image`, `audio`, `resource` (embedded), `resource_link`; ACP "introduces custom types for coding-specific features like diff visualization" beyond MCP's JSON reuse [24]. All file paths MUST be absolute; line numbering is 1-based; errors follow JSON-RPC.

---

## Cross-cutting patterns

### Streaming output (autoscroll lock, jump-to-bottom)

ACP's `agent_message_chunk` is the canonical streaming primitive — chunks accumulate into a single logical message [26]. Codex's full-screen TUI streams into a composer with explicit "watch Codex explain its plan" affordance [14]. Claude Code's VS Code extension shows "inline diffs and conversation history" with the transcript scrolling [12]. Devin keeps progress visible in the embedded session and replicates it back into Ask Devin so users can monitor without context switching [2]. **Pattern:** every product streams chunk-by-chunk; the supervisor UI must offer autoscroll lock + "jump to bottom" button (no product makes this explicit in docs, but every screenshot shows it).

### Tool calls — collapsed-by-default, expandable, copyable

ACP frames each tool as a `tool_call` with subsequent `tool_call_update` notifications carrying status, output, and final result [26]. Devin's Shell/IDE/Browser triptych is the workspace-tool flavour [1]. Claude Code's `Bash` tool output is shown collapsed with a re-open affordance in the desktop app [12]. **Pattern:** tool-call cards must (1) collapse by default, (2) show name + status badge (`pending|in_progress|completed|failed`), (3) expose copy-as-shell on Bash, (4) expose copy-as-curl on HTTP, (5) link to the source tool definition / MCP server.

### Inline file diffs inside the run timeline

ACP explicitly carves out **diff visualization** as a coding-specific content type beyond MCP [24]. Devin Review groups diffs "logically" with copy/move detection [4]. Cursor Composer presents accept-per-file with Checkpoints as the local-snapshot escape hatch [9]. Aider auto-commits each edit so the diff is queryable as a git artefact [15]. Claude Code VS Code extension renders **inline diffs** in the editor pane [12]. **Pattern:** diffs are first-class transcript items, not tool-output dumps. Per-file accept/reject is table stakes; per-hunk is a delight.

### Permission prompts — placement

ACP's `session/request_permission` blocks the turn until the client responds [25]. Claude Code's `PreToolUse` hook can `validate, log, block, or transform` tool behaviour before execution [8]. Codex CLI exposes three approval modes (`Auto`, `Read-only`, `Full Access`) as a session-level setting [14]. Cursor uses Checkpoints + queued messages — accept/reject happens after the fact [9]. Devin Review embeds approval-style "request changes" + "approve" actions on the PR page itself [4]. **Pattern:** prompts ride **inline in the transcript** for context-rich decisions (Bash `rm -rf`, deploy, network egress) and **modal** only for irreversible actions. Side-rail prompts (Cursor checkpoint diff) work for batch review.

### Multi-agent orchestration — visualization

Devin's coordinator monitors "managed Devins each in its own VM" and compiles results [5]. Claude Agent SDK subagents carry `parent_tool_use_id` for parent-child attribution [8]. Cursor's `/multitask` triggers async subagents [11]. LangGraph Studio shows the **graph architecture** in Graph mode [19]. Argo Workflows + Dagster show DAGs with colour-coded node status; Temporal exposes parent/child relationships in a dedicated pane [20][21][22]. Airflow's Graph View shows task deps with skip explanations [23]. **Pattern:** a left-rail DAG of runs (rectangles, status-coloured edges) + a centre pane of the focused run's transcript. Click any node = swap the centre pane.

### Session forks / branches

Claude Agent SDK exposes `resume: session_id` and explicitly supports forking sessions "to explore different approaches" [8]. ACP `session/load` replays history; `session/resume` reconnects without replay; sessions are independent threads [25]. Cursor Checkpoints are the lightweight fork primitive — snapshot before significant change, restore later [9]. **Pattern:** "fork from this turn" affordance on every transcript message; forks become first-class children of the parent run.

### Cost / token tracking — non-naggy

Cursor's **Context Usage Breakdown** is a passive panel users open when they want it [11]. Devin's ACU consumption is implicit in the session count [3]. Cursor Cloud Agents set a spend limit on first use, then bill by selected model's API pricing [10]. Claude Code's skill listing budget defaults to 1% of context and overflows by dropping least-used descriptions — a self-balancing rule, not a banner [13]. **Pattern:** put cost in a small status-bar chip ("$0.34 · 12.4k toks · gpt-5.5") that opens a side panel on click. Never block work to surface a cost number.

### Trace IDs — surfaced and linked

LangSmith's hierarchy (Project → Trace → Run → Thread) means every span has an addressable ID; threads link multi-turn conversations [18]. ACP `session/new` returns a unique session id used by every subsequent prompt/cancel/update [25]. Claude Agent SDK exposes `session_id` in the `SystemMessage{subtype:'init'}` event [8]. Temporal Workflows are filterable by ID, type, and custom search attributes [20]. **Pattern:** every transcript message has a copyable `session_id @ turn_id @ tool_call_id` chip. Click → deep link.

---

## Recommendations for Fulcrum

### Web Live Session Pane

**Three-column layout.** Left = sessions list (Devin-style [1]) with status chips and search. Centre = transcript: `agent_message_chunk` text blocks, `tool_call` cards (collapsed, status-badged, copy-as-shell button), inline file diffs (per-file accept/reject), inline permission prompts. Right = workspace dock with tabs `Shell · Files · Browser · Plan · Cost`. Sticky **plan strip** at the top of the centre column rendering the latest `plan` `session/update` so the supervisor always sees the agent's intent. **Autoscroll lock + "jump to bottom"** button bottom-right. **"Fork from this turn"** action on every transcript row. **Per-step ▶ Play / 💬 Discuss / ACP chat** menu on each `tool_call` and `agent_message_chunk`: Play re-runs the step in a new sub-session; Discuss opens an inline ACP chat with the agent scoped to that step; ACP chat sends a fresh `session/prompt` with the step as quoted context.

### Web Run Feed

Per-task event stream rendered as a vertical timeline (Airflow Grid + Temporal Event History [20][23]). Columns: time, event kind (`plan|agent_message_chunk|tool_call|tool_call_update|permission|fork|fail`), session, agent, summary, cost-delta. Filters by kind / session / agent / status; saved views like Temporal. Group-by `parent_tool_use_id` collapses subagent fan-outs (Claude Agent SDK pattern [8]). Default order is chronological with reverse-chrono toggle. Inline "mark success / retry / terminate" verbs on each row (Airflow [23] + Temporal [20]).

### Web Multi-Agent Orchestrator

Left rail = DAG (Argo / Dagster / LangGraph Studio [19][21][22]) showing every run as a node; edges = `parent_tool_use_id` relationships; node colour = ACP status (`pending|in_progress|completed|failed`). Click a node = centre pane swaps to that run's Live Session Pane. Right rail = sticky **Cost & SLO panel** (Cursor Context Usage Breakdown shape [11]) plus a Devin-style coordinator summary [5]. Toolbar: `/multitask`, `Resume`, `Fork`, `Cancel`, `Mark complete`, **all dispatch ACP `session/*` calls**.

### TUI Orchestrator pane + live agent screen

Two-pane split (Codex TUI inspiration [14]). Top pane = compact DAG with vim-like keybindings (`j/k` next/prev, `Enter` focus, `f` fork, `c` cancel, `r` retry); colour-coded status. Bottom pane = focused agent's transcript: streaming `agent_message_chunk`, collapsed tool calls (`Tab` expands), inline diffs with `a` accept / `r` reject / `h` next-hunk. Permission prompts pop modal at the bottom with `y/n/a` (yes/no/always). Status bar = `session_id · cost · tokens · effort · model`. `:` opens a slash-command palette mapped to ACP methods.

### CLI `fulcrum runs feed --watch`

Streaming `tail -f`-style output, ACP `session/update` notifications rendered as one line per event:

```
HH:MM:SS  <session>  <kind>  <agent>  <summary>        <cost>
```

Tool calls render two lines (request + result); diffs render as `+N -M file` summary with `--diff` to inline-render. Flags: `--filter kind=<k>`, `--session <id>`, `--agent <name>`, `--since <ts>`, `--json` (emits raw ACP `session/update`). On `^C` send `session/cancel`. Pair with `fulcrum runs attach <id>` for a TUI takeover.

### API event-stream schema (JSON-RPC over WS, SSE fallback, ACP-compatible)

Adopt ACP verbatim as the wire format [25][26][27]:

- Transport: WebSocket JSON-RPC 2.0 default; SSE (`text/event-stream`) fallback for HTTP-only consumers; stdio sub-process for local CLI/TUI (Zed pattern [24]).
- Methods: `initialize`, `authenticate`, `session/new`, `session/load`, `session/resume`, `session/prompt`, `session/cancel`, `session/update`, `session/request_permission`.
- `session/update` kinds: `plan`, `agent_message_chunk`, `tool_call`, `tool_call_update`, `available_commands_update`, `current_mode_update` — plus Fulcrum extensions namespaced as `fulcrum/<kind>` (e.g. `fulcrum/cost_delta`, `fulcrum/fork`, `fulcrum/repo_state`).
- Tool-call status: `pending|in_progress|completed|failed`.
- Content blocks: ACP standard (`text`, `image`, `audio`, `resource`, `resource_link`) + a `diff` block carrying `path`, `oldText`, `newText`, `hunks[]` (per ACP's "custom types for coding-specific features" [24]).
- Every message carries `session_id`, `parent_tool_use_id?`, `turn_id`, `event_id` so the Run Feed can group, filter, and deep-link (LangSmith Project→Trace→Run→Thread shape [18]).
- Permission prompts: `session/request_permission` blocks the turn; client renders inline; client persists the answer for `always` decisions per-tool-pattern.

### Per-step ▶ Play / 💬 Discuss / ACP chat

Each transcript row exposes three verbs. **▶ Play** issues `session/new` with the row's content as the initial `session/prompt` (Aider `/undo` + rerun semantics [15], Cursor Checkpoint rollback [9]). **💬 Discuss** opens an inline ACP chat scoped to the step — Fulcrum spawns a child session linked by `parent_tool_use_id` (Claude Agent SDK subagent pattern [8]) so the conversation appears as a nested thread under the parent in the DAG. **ACP chat** is the full-fidelity peer: a new ACP `session/new` against the same agent with the step quoted as a `resource` content block [27], usable from external editors (Zed, Neovim, VS Code) without leaving the workflow.

---

## Citations

[1] Devin docs — Get Started: Devin Intro. <https://docs.devin.ai/get-started/devin-intro>
[2] Devin docs — Ask Devin. <https://docs.devin.ai/work-with-devin/ask-devin>
[3] Devin docs — When to use Devin. <https://docs.devin.ai/essential-guidelines/when-to-use-devin>
[4] Devin docs — Devin Review. <https://docs.devin.ai/work-with-devin/devin-review>
[5] Devin docs — Advanced Capabilities. <https://docs.devin.ai/work-with-devin/advanced-capabilities>
[6] Devin docs — Workflows. <https://docs.devin.ai/learn-about-devin/workflows>
[7] Anthropic Engineering — Effective harnesses for long-running agents. <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
[8] Claude Agent SDK overview. <https://code.claude.com/docs/en/agent-sdk/overview>
[9] Cursor docs — Agent. <https://cursor.com/docs/agent>
[10] Cursor docs — Cloud Agents / Background Agent. <https://cursor.com/docs/background-agent>
[11] Cursor changelog. <https://www.cursor.com/changelog>
[12] Claude Code overview. <https://code.claude.com/docs/en/overview>
[13] Claude Code — Skills reference. <https://code.claude.com/docs/en/slash-commands>
[14] OpenAI developers — Codex CLI features. <https://developers.openai.com/codex/cli/features>
[15] Aider — Usage. <https://aider.chat/docs/usage.html>
[16] Replit docs — Replit Agent. <https://docs.replit.com/replitai/agent>
[17] Linear — Agents. <https://linear.app/agents>
[18] LangSmith — Observability Concepts. <https://docs.langchain.com/langsmith/observability-concepts>
[19] LangGraph Platform — LangGraph Studio. <https://docs.langchain.com/langgraph-platform/langgraph-studio>
[20] Temporal — Web UI. <https://docs.temporal.io/web-ui>
[21] Argo Workflows docs. <https://argo-workflows.readthedocs.io/en/latest/>
[22] Dagster — Webserver. <https://docs.dagster.io/guides/operate/webserver>
[23] Apache Airflow — UI. <https://airflow.apache.org/docs/apache-airflow/stable/ui.html>
[24] Zed Blog — Zed's ACP. <https://zed.dev/blog/zeds-acp>
[25] Agent Client Protocol — Overview. <https://agentclientprotocol.com/protocol/overview>
[26] ACP — Prompt Turn. <https://agentclientprotocol.com/protocol/prompt-turn>
[27] ACP — Content. <https://agentclientprotocol.com/protocol/content>
[28] ACP — Session Setup. <https://agentclientprotocol.com/protocol/session-setup>
