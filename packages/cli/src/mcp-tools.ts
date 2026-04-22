// packages/cli/src/mcp-tools.ts
// Single source of truth for all MCP tool schemas.
// Used by the MCP server (tool registration) and the CLAUDE.md code-generator.

export interface ToolAnnotations {
  /** True if the tool never writes to persistent state. */
  readOnlyHint?: boolean
  /** True if calling multiple times has the same effect as once. */
  idempotentHint?: boolean
  /** True if the tool may cause writes that are hard to reverse. */
  destructiveHint?: boolean
  /** True if the tool queries external systems or models (e.g. embeddings). */
  openWorldHint?: boolean
}

export interface ToolSchema {
  /** Human-readable name shown in UIs (≤ 60 chars). */
  title: string
  name: string
  description: string
  annotations?: ToolAnnotations
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  /**
   * JSON Schema (draft-07, object type) describing the shape of structuredContent
   * returned by this tool. Must be an object schema (arrays are not supported as
   * top-level schemas per MCP spec). When present, the server builds a per-tool
   * Zod schema and returns structuredContent alongside the text content.
   * When absent, read-only tools use a passthrough schema; write tools omit it.
   * (GAP-MCP-5: per-tool output contracts)
   */
  outputSchema?: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  /**
   * When true, the server will emit `notifications/progress` before and after
   * dispatching this tool if the caller provides `_meta.progressToken`.
   * (GAP-MCP-11: progress notifications for long-running tools)
   */
  longRunningHint?: boolean
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    title: 'List Tasks',
    name: 'list_tasks',
    description: 'Read tasks in workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filter by status optional. Read-only. workspace_id + project_id optional (default cwd).',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID (optional — defaults to cwd project)' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        status: { type: 'string', description: 'Filter by status (queued, running, blocked, completed)' },
        limit: { type: 'number', description: 'Max results (default 40)' },
      },
    },
  },
  {
    title: 'Create Task',
    name: 'create_task',
    description: 'Create task. Auto-creates workspace + project if absent. Writes task row. Returns task_id, title, status, priority, assigned_to. Requires title. workspace_id + project_id optional (default cwd).',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        project_id: { type: 'string', description: 'Project ID (optional — defaults to cwd project)' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        description: { type: 'string', description: 'Optional task description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'], description: 'Priority level' },
        assigned_to: { type: 'string', description: 'Agent role slug to assign the task to' },
        done_criteria: { type: 'string', description: 'Definition of done' },
      },
      required: ['title'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assigned_to: { type: 'string' },
      },
      required: ['task_id', 'title', 'status'],
    },
  },
  {
    title: 'Update Task',
    name: 'update_task',
    description: "Update task status, note, or assignment. Updates a workspace-scoped task row in place. Returns task_id, updated=true, changed fields. Defaults workspace_id from the current project context.",
    annotations: { idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        workspace_id: { type: 'string', description: 'Workspace scope for the task; defaults to current workspace when omitted' },
        status: { type: 'string', description: 'New status value' },
        note: { type: 'string', description: 'Progress note' },
        assigned_to: { type: 'string', description: 'Reassign to this agent role slug' },
      },
      required: ['task_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        updated: { type: 'boolean' },
        changes: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id', 'updated'],
    },
  },
  {
    title: 'Recall Memory',
    name: 'recall_memory',
    description: 'Hybrid semantic search over agent memory (FTS5 + vector + rerank). Returns top-k memories for query in scope. workspace_id optional (default cwd). project_id optional (omit for workspace-wide). Returns: id, content (truncated to max_chars), score 0.0–1.0, tags.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        project_id: { type: 'string', description: 'Project ID (optional — omit for workspace-wide recall)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        offset: { type: 'number', description: 'Pagination offset — skip this many top results (default 0). Use for MemGPT-style context paging.' },
        max_chars: { type: 'number', description: 'Truncate content to this many characters (default 500)' },
        query_scope: {
          type: 'string',
          enum: ['session', 'project', 'workspace'],
          description: 'Search breadth: project (default) = workspace+project; workspace = all projects in workspace; session = specific agent session',
        },
        session_id: { type: 'string', description: 'Session ID — required when query_scope=session' },
      },
      required: ['query'],
    },
  },
  {
    title: 'Recall Knowledge (v3)',
    name: 'recall_knowledge',
    description: 'Memory v3 retrieval: FTS5 + vector + graph traversal fused via weighted RRF. Filtered by confidence floor + supersession. Returns L1 curated pages + L0 back-refs (sources[] + l0_wikilinks[]) — follow any claim to raw via `read_raw_source`. `recall_memory` remains back-compat alias. workspace_id defaults cwd; project_id optional.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        project_id: { type: 'string', description: 'Project ID (optional — omit for workspace-wide recall)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
        max_chars: { type: 'number', description: 'Truncate content to this many characters (default 500)' },
        confidence_floor: { type: 'number', description: 'Minimum confidence for a page to be returned (default 0.3)' },
        graph_hops: { type: 'number', description: 'BFS depth from query-mentioned entities (default 2)' },
        include_superseded: { type: 'boolean', description: 'Include pages whose superseded_by is non-null (default false)' },
      },
      required: ['query'],
    },
  },
  {
    title: 'Get Memory Sources',
    name: 'get_memory_sources',
    description: 'Walk L1 page back to L0 sources: frontmatter `sources[]` + inline `[[raw/...]]` wikilinks resolved. Returns per-source { l0_id, source_type, snippet, vault_path, created_at }. Missing sources reported as source_type="missing" — never silently lose reference.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'L1 curated page id' } },
      required: ['page_id'],
    },
  },
  {
    title: 'Get RAG Rebuild Plan',
    name: 'get_rag_rebuild_plan',
    description: 'Read-only RAG lifecycle rebuild plan. Returns scope counts and no candidate; does not mutate derived state.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        domains: { type: 'array', items: { type: 'string', enum: ['l0', 'l1', 'fts', 'code', 'vectors', 'graph'] } },
        allow_empty: { type: 'boolean' },
      },
    },
  },
  {
    title: 'Get RAG Rebuild Dry Run',
    name: 'get_rag_rebuild_dry_run',
    description: 'Read-only RAG lifecycle rebuild dry-run. Returns planned counts and validation without mutating served state.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        domains: { type: 'array', items: { type: 'string', enum: ['l0', 'l1', 'fts', 'code', 'vectors', 'graph'] } },
        allow_empty: { type: 'boolean' },
      },
    },
  },
  {
    title: 'Start RAG Rebuild',
    name: 'start_rag_rebuild',
    description: 'Execute destructive RAG lifecycle rebuild with staged candidate, snapshot validation, parity checks, report persistence, and audit event.',
    annotations: { destructiveHint: true },
    longRunningHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        domains: { type: 'array', items: { type: 'string', enum: ['l0', 'l1', 'fts', 'code', 'vectors', 'graph'] } },
        allow_empty: { type: 'boolean' },
      },
    },
  },
  {
    title: 'Get RAG Rebuild Report',
    name: 'get_rag_rebuild_report',
    description: 'Read a persisted RAG rebuild report by ID, scoped by workspace_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        report_id: { type: 'string' },
        workspace_id: { type: 'string' },
      },
      required: ['report_id'],
    },
  },
  {
    title: 'Inspect Memory',
    name: 'inspect_memory',
    description: 'Dump full L1 page — frontmatter, body, serialized form, resolved wikilink absolute paths (exists flag per link). Use before marking wrong or overriding a claim.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'L1 curated page id' } },
      required: ['page_id'],
    },
  },
  {
    title: 'Read Raw Source',
    name: 'read_raw_source',
    description: 'Full body of L0 raw source (audit root). Strips file frontmatter — only captured bytes in response.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { l0_id: { type: 'string', description: 'L0 source id (the ULID from l0_sources.source_id)' } },
      required: ['l0_id'],
    },
  },
  {
    title: 'Trace Claim',
    name: 'trace_claim',
    description: 'Reverse lookup: substring → every L1 page containing it, ranked by confidence. Each hit carries snippet + match_count + sources[] for jumping to L0 provenance.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'Substring to search for (case-insensitive)' },
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        limit: { type: 'number', description: 'Max hits (default 20)' },
      },
      required: ['claim'],
    },
  },
  {
    title: 'Propose Memory Consolidation',
    name: 'consolidate_memory',
    description: 'Propose merge candidates across L1 pages sharing entity set + retention tier, lowest-confidence member above floor. Dry-run only in v3 PR 7.4 — curator apply path lands later. Returns { dry_run: true, candidates: [{entity_set, retention_tier, page_ids, min_confidence_in_group, workspace_id, project_id}] }.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Scope to this workspace (optional; defaults to current cwd)' },
        project_id: { type: 'string', description: 'Scope to a single project (optional)' },
        min_confidence: { type: 'number', description: 'Floor on the lowest-confidence member (default 0.5)' },
        retention_tier: { type: 'string', description: 'Only groups in this tier (working|episodic|semantic|procedural)' },
      },
    },
  },
  {
    title: 'Lint Memory Vault',
    name: 'lint_memory',
    description: 'Verify migrated memory vault: zero orphans, zero missing-source refs, zero supersession cycles. Migration stubs (sources=[] + sources_via=[]) tracked separately, NOT counted as orphans. Returns { ok, counts: { pages_checked, orphans, migration_stubs, missing_sources, supersession_cycles }, issues[] }.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Scope to this workspace (optional; default scans all workspaces)' },
      },
    },
  },
  {
    title: 'Mark Memory Wrong',
    name: 'mark_memory_wrong',
    description: 'Flag L1 page incorrect. Writes L0 correction entry under `raw/correction/` with reason + optional correction_body. Does NOT auto-run curator — operator or scheduled pass triggers re-curation; correction L0 entry = input curator consumes to supersede flagged page.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'L1 page to flag' },
        reason: { type: 'string', description: 'Why this page is wrong' },
        correction_body: { type: 'string', description: 'Optional detailed correction text' },
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
      },
      required: ['page_id', 'reason', 'workspace_id'],
    },
  },
  {
    title: 'Write Memory',
    name: 'write_memory',
    description: 'Persist memory note to vault (L0), SQLite FTS5 (L1), vector index (L2). Writes memory row + vault file. Returns saved=true, memory_id, project_id, tags. Requires content. workspace_id + project_id optional (default cwd).',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content (plain text)' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        project_id: { type: 'string', description: 'Project ID (optional — defaults to cwd project)' },
        title: { type: 'string', description: 'Optional title (defaults to first 80 chars of content)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tag strings (e.g. ["decision","architecture"])' },
      },
      required: ['content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        saved: { type: 'boolean' },
        memory_id: { type: 'string' },
        project_id: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['saved', 'memory_id'],
    },
  },
  {
    title: 'List Agent Profiles',
    name: 'list_agent_profiles',
    description: 'Read all 24 canonical AgentRole profiles. workspace_id provided → also returns DB-backed custom profiles for that workspace. Read-only. Returns {role, name, description, capabilities}[].',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Optional. When provided, DB-backed profiles for this workspace are merged into the response.',
        },
      },
    },
  },
  {
    title: 'Get Agent Run Status',
    name: 'get_agent_run_status',
    description: 'Read live agent run status. Read-only. Returns run_id, status, role, current_step, progress_pct. Requires run_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string', description: 'Run ID returned by start_agent_run' } },
      required: ['run_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string' },
        role: { type: 'string' },
        current_step: { type: 'string' },
        progress_pct: { type: 'number' },
      },
      required: ['run_id', 'status', 'role'],
    },
  },
  {
    title: 'Start Agent Run',
    name: 'start_agent_run',
    description: 'Register start of agent run. Call at start of every task. Auto-creates stub task if no task_id. Inserts agent_runs row, sets task status=running. Returns run_id, status. Requires agent_role. workspace_id optional (default cwd). context_type defaults to subagent.',
    annotations: { idempotentHint: false },
    longRunningHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to associate (auto-creates stub if not found or not provided)' },
        agent_role: { type: 'string', description: 'One of the 24 canonical role slugs (e.g. software_engineer)' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        project_id: { type: 'string', description: 'Optional project ID (defaults to workspace_id)' },
        context_type: { type: 'string', enum: ['primary', 'subagent', 'cron', 'heartbeat', 'flush'], description: 'Run context type (defaults to subagent)' },
        worktree_path: { type: 'string', description: 'Optional git worktree path for code-writing roles' },
        pi_run_id: { type: 'string', description: 'Optional custom run ID for external tracking' },
        model: { type: 'string', description: 'Optional model override (e.g. "claude-sonnet-4-6")' },
        dispatch: { type: 'boolean', description: 'If true, spawn a Claude Code subprocess for this run (fire-and-forget)' },
      },
      required: ['agent_role'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string' },
        dispatched: { type: 'boolean' },
        pid: { type: 'number' },
      },
      required: ['run_id', 'status'],
    },
  },
  {
    title: 'Heartbeat Agent Run',
    name: 'heartbeat_agent_run',
    description: 'Liveness heartbeat to prevent stale-mark. Call ~30s during long tasks. Updates heartbeat_at + optional progress. Returns run_id, ok=true. Requires run_id. workspace_id optional (default cwd).',
    annotations: { idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        current_step: { type: 'string', description: 'Optional current step description' },
        progress_pct: { type: 'number', description: 'Optional progress percentage (0–100)' },
      },
      required: ['run_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        ok: { type: 'boolean' },
      },
      required: ['run_id', 'ok'],
    },
  },
  {
    title: 'Complete Agent Run',
    name: 'complete_agent_run',
    description: 'Mark agent run finished with optional summary + artifact paths. Sets status=finished, records artifacts. Returns run_id, status. Requires run_id. workspace_id optional (default cwd).',
    annotations: { destructiveHint: true },
    longRunningHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        output_summary: { type: 'string', description: 'Summary of what was accomplished' },
        artifact_paths: { type: 'array', items: { type: 'string' }, description: 'Artifact file paths changed or created' },
      },
      required: ['run_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['run_id', 'status'],
    },
  },
  {
    title: 'Block Agent Run',
    name: 'block_agent_run',
    description: 'Mark agent run blocked with reason. Use when cannot continue without human input or dependency resolving. Sets status=blocked, records reason. Returns run_id, status, reason. Requires run_id + reason. workspace_id optional (default cwd).',
    annotations: { destructiveHint: true },
    longRunningHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        reason: { type: 'string', description: 'Why the run is blocked (will surface in workspace status)' },
      },
      required: ['run_id', 'reason'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['run_id', 'status', 'reason'],
    },
  },
  {
    title: 'Sweep Stale Agent Runs',
    name: 'sweep_stale_runs',
    description: 'Abort runs still marked running with no heartbeat >stale_minutes (default 10). Use on session start to reap zombies from crashed agents that never fired agent_end/session_shutdown. Flips matching rows → status=aborted, status_category=done + appends run_event. Returns reaped run_ids.',
    annotations: { destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID (optional — omit to sweep every workspace)' },
        stale_minutes: { type: 'number', description: 'Staleness threshold in minutes (default 10)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        reaped: { type: 'array', items: { type: 'string' }, description: 'run_ids that were aborted' },
      },
      required: ['reaped'],
    },
  },
  {
    title: 'Build Chief-of-Staff Context',
    name: 'build_cos_context',
    description: 'Build CoS world-state snapshot: active tasks, running agents, blockers, recent events. Read-only. Returns context_markdown formatted for system-prompt injection. workspace_id + project_id optional (default cwd).',
    annotations: { readOnlyHint: true, idempotentHint: true },
    longRunningHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Optional goal description (included in snapshot header)' },
        project_id: { type: 'string', description: 'Project ID (optional — defaults to cwd project)' },
        workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' },
        max_tasks: { type: 'number', description: 'Max tasks to include (default 20)' },
        max_events: { type: 'number', description: 'Max events to include (default 10)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        context_markdown: { type: 'string' },
        project_id: { type: 'string' },
        workspace_id: { type: 'string' },
      },
      required: ['context_markdown', 'project_id', 'workspace_id'],
    },
  },
  {
    title: 'Get Workspace Status',
    name: 'get_workspace_status',
    description: 'Read full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Read-only. Returns workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs[], blockers[]. workspace_id optional (default cwd).',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { workspace_id: { type: 'string', description: 'Workspace ID (optional — defaults to cwd workspace)' } },
    },
    outputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        active_runs: { type: 'number' },
        blocked_runs: { type: 'number' },
        wip_count: { type: 'number' },
        queued_tasks: { type: 'number' },
        runs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              run_id: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              task_id: { type: 'string' },
            },
          },
        },
        blockers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              run_id: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
      required: ['workspace_id', 'active_runs', 'blocked_runs', 'wip_count', 'queued_tasks'],
    },
  },
  {
    title: 'Create Team Template',
    name: 'create_team_template',
    description: 'Create reusable team template with role slots + policy. Templates global (not workspace-scoped). Writes team_templates row. Returns template object. Requires name + slots array.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable template name (globally unique)' },
        description: { type: 'string', description: 'Optional description' },
        slots: {
          type: 'array',
          description: 'Team slots — each specifies a role, counts, and optional agent_profile',
          items: {
            type: 'object',
            properties: {
              slot_id: { type: 'string', description: 'Unique slot identifier within the template' },
              role: { type: 'string', description: 'AgentRole slug (e.g. software_engineer)' },
              min_count: { type: 'number', description: 'Minimum members of this slot' },
              max_count: { type: 'number', description: 'Maximum members of this slot' },
              concurrency_cap: { type: 'number', description: 'Max concurrent members allowed' },
              required: { type: 'boolean', description: 'Whether the slot must be filled' },
              description: { type: 'string' },
              agent_profile: { type: 'string', description: 'Optional DB-backed profile_id' },
              spawn_mode: { type: 'string', enum: ['auto', 'manual'] },
            },
            required: ['slot_id', 'role', 'min_count', 'max_count', 'concurrency_cap', 'required'],
          },
        },
        policy: {
          type: 'object',
          description: 'Optional team policy (communication_mode, budget_class, quality_class, etc.)',
        },
      },
      required: ['name', 'slots'],
    },
  },
  {
    title: 'Invoke Team',
    name: 'invoke_team',
    description: 'Instantiate team from template + start execution. Only chief_of_staff (canInvokeTeams gate). Creates team_instance row, spawns agents. Returns team instance. Requires template_id, workspace_id, purpose, caller_agent_id, caller_role.',
    annotations: { destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        template_id: { type: 'string', description: 'Template to instantiate' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project scope' },
        purpose: { type: 'string', description: 'Why this team is being spawned' },
        task_id: { type: 'string', description: 'Optional originating task' },
        caller_agent_id: { type: 'string', description: 'Agent ID of the invoker' },
        caller_role: { type: 'string', description: 'Role of the invoker (must be chief_of_staff)' },
        initial_slots: {
          type: 'object',
          description: 'Optional initial slot → agent_id[] mapping',
        },
      },
      required: ['template_id', 'workspace_id', 'purpose', 'caller_agent_id', 'caller_role'],
    },
  },
  {
    title: 'List Team Templates',
    name: 'list_team_templates',
    description: 'Read all team templates (global, not workspace-scoped). Read-only. Returns template objects[] with slots + policy.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
    },
  },
  {
    title: 'List Team Instances',
    name: 'list_team_instances',
    description: 'Read team instances in workspace. Optional status_category filter. Read-only. Returns team instance objects[]. Requires workspace_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project scope' },
        status_category: {
          type: 'string',
          enum: ['backlog', 'active', 'blocked', 'done'],
          description: 'Filter by status category',
        },
        limit: { type: 'number', description: 'Max rows (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
      required: ['workspace_id'],
    },
  },
  {
    title: 'Create Agent Profile',
    name: 'create_agent_profile',
    description: 'Create DB-backed agent profile for workspace. Extends 24 canonical AgentRole slugs with workspace-scoped specializations. Writes agent_profiles row. Returns profile object. Requires workspace_id, name, description.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Profile name, unique within the workspace' },
        description: { type: 'string', description: 'Profile description' },
        base_role: { type: 'string', description: 'Canonical AgentRole slug to inherit from (defaults to "custom")' },
        system_prompt: { type: 'string', description: 'Optional system prompt override' },
        capabilities: { type: 'object', description: 'Optional capability flags / metadata' },
        created_by: { type: 'string', description: 'Agent ID of the creator' },
      },
      required: ['workspace_id', 'name', 'description'],
    },
  },
  {
    title: 'Create Agent Definition',
    name: 'create_agent_definition',
    description: 'Create canonical role definition: model, tools_allow/deny, executor_uri, system prompt. Writes agent_definitions row. Returns definition object. Requires role, display_name, description.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'AgentRole slug (must be one of the 24 canonical roles)' },
        display_name: { type: 'string', description: 'Human-readable role name' },
        description: { type: 'string', description: 'Role description' },
        version: { type: 'string', description: 'Semver version (default "0.1.0")' },
        stability: { type: 'string', enum: ['stable', 'beta', 'experimental', 'deprecated'], description: 'Stability tier' },
        system_prompt: { type: 'string', description: 'System prompt override' },
        model: { type: 'string', description: 'Model ID (e.g. "claude-sonnet-4-6")' },
        provider: { type: 'string', description: 'Provider (default "anthropic")' },
        tools_allow: { type: 'array', description: 'Tool names the agent may use (null = all)' },
        tools_deny: { type: 'array', description: 'Tool names the agent may not use (null = none denied)' },
        capabilities: { type: 'array', description: 'Capability strings (e.g. ["code", "web_search"])' },
        executor_uri: { type: 'string', description: 'Executor URI (e.g. "claude-code://", "pi://")' },
      },
      required: ['role', 'display_name', 'description'],
    },
  },
  {
    title: 'Get Agent Definition',
    name: 'get_agent_definition',
    description: 'Read canonical AgentRole definition: model, tools, executor_uri, system_prompt. Read-only. Returns definition object or null. Requires role.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'AgentRole slug' },
      },
      required: ['role'],
    },
  },
  {
    title: 'Update Agent Definition',
    name: 'update_agent_definition',
    description: 'Update existing agent definition fields. Updates agent_definitions row in place. Returns updated definition. Requires role.',
    annotations: { idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'AgentRole slug to update' },
        display_name: { type: 'string', description: 'New display name' },
        description: { type: 'string', description: 'New description' },
        version: { type: 'string', description: 'New version' },
        stability: { type: 'string', enum: ['stable', 'beta', 'experimental', 'deprecated'], description: 'New stability' },
        system_prompt: { type: 'string', description: 'New system prompt' },
        model: { type: 'string', description: 'New model' },
        executor_uri: { type: 'string', description: 'New executor URI' },
      },
      required: ['role'],
    },
  },
  {
    title: 'List Agent Definitions',
    name: 'list_agent_definitions',
    description: 'Read all agent definitions. Optional stability filter. Read-only. Returns definition objects[].',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        stability: { type: 'string', enum: ['stable', 'beta', 'experimental', 'deprecated'], description: 'Filter by stability tier' },
      },
    },
  },
  {
    title: 'Get Current Context',
    name: 'get_current_context',
    description: 'Returns workspace_id + project_id for MCP-server cwd (deterministic, no file). Use at session start to discover workspace without reading .fulcrum.json. Also returns readiness: tools_available, monitor_url, monitor_running (200ms probe, 15s cache), suggested_next_call. Read-only. Returns workspace_id, project_id, cwd, readiness.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        cwd: { type: 'string' },
        readiness: {
          type: 'object',
          properties: {
            tools_available: { type: 'number' },
            monitor_url: { type: 'string' },
            monitor_running: { type: 'boolean' },
            suggested_next_call: { type: 'string' },
          },
          required: ['tools_available', 'monitor_url', 'monitor_running', 'suggested_next_call'],
        },
      },
      required: ['workspace_id', 'project_id', 'cwd', 'readiness'],
    },
  },
]

/** Convenience lookup: tool name → schema */
export const TOOL_SCHEMA_MAP = new Map(TOOL_SCHEMAS.map(t => [t.name, t]))
