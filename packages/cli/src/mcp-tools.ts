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
  }
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    title: 'List Tasks',
    name: 'list_tasks',
    description: 'Reads tasks in a workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filters by status when provided. Effect: read-only. Returns: array of task summaries. Requires workspace_id and project_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        status: { type: 'string', description: 'Filter by status (queued, running, blocked, completed)' },
        limit: { type: 'number', description: 'Max results (default 40)' },
      },
      required: ['project_id', 'workspace_id'],
    },
  },
  {
    title: 'Create Task',
    name: 'create_task',
    description: 'Creates a new task in the project. Auto-creates workspace and project if they do not exist. Effect: writes task row. Returns: task_id, title, status, priority, assigned_to. Requires title, project_id, workspace_id.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        description: { type: 'string', description: 'Optional task description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'], description: 'Priority level' },
        assigned_to: { type: 'string', description: 'Agent role slug to assign the task to' },
        done_criteria: { type: 'string', description: 'Definition of done' },
      },
      required: ['title', 'project_id', 'workspace_id'],
    },
  },
  {
    title: 'Update Task',
    name: 'update_task',
    description: "Updates a task's status, note, or assignment. Effect: updates task row in place. Returns: task_id, updated=true, list of changed fields. Requires task_id.",
    annotations: { idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        status: { type: 'string', description: 'New status value' },
        note: { type: 'string', description: 'Progress note' },
        assigned_to: { type: 'string', description: 'Reassign to this agent role slug' },
      },
      required: ['task_id'],
    },
  },
  {
    title: 'Recall Memory',
    name: 'recall_memory',
    description: 'Hybrid semantic search over agent memory (FTS5 + vector + rerank). Effect: read-only, queries embedding model. Returns: array of {content, score, tags} ordered by relevance. Requires workspace_id, project_id, and query.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        query_scope: {
          type: 'string',
          enum: ['session', 'project', 'workspace', 'global'],
          description: 'Search breadth: project (default) = workspace+project; workspace = all projects in workspace; global = cross-workspace; session = specific agent session',
        },
        session_id: { type: 'string', description: 'Session ID — required when query_scope=session' },
      },
      required: ['query', 'workspace_id', 'project_id'],
    },
  },
  {
    title: 'Write Memory',
    name: 'write_memory',
    description: 'Persists a memory note to vault (L0), SQLite FTS5 (L1), and vector index (L2). Effect: writes memory row + vault file. Returns: saved=true, memory_id, project_id, tags. Requires content, workspace_id, project_id.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content (plain text)' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Optional title (defaults to first 80 chars of content)' },
        tags: { type: 'string', description: 'Comma-separated tags (e.g. "decision,architecture")' },
      },
      required: ['content', 'workspace_id', 'project_id'],
    },
  },
  {
    title: 'List Agent Profiles',
    name: 'list_agent_profiles',
    description: 'Reads all 24 canonical AgentRole profiles. When workspace_id is provided, also returns DB-backed custom profiles for that workspace. Effect: read-only. Returns: array of {role, name, description, capabilities}.',
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
    description: 'Reads live status of an agent run. Effect: read-only. Returns: run_id, status, role, current_step, progress_pct. Requires run_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string', description: 'Run ID returned by start_agent_run' } },
      required: ['run_id'],
    },
  },
  {
    title: 'Start Agent Run',
    name: 'start_agent_run',
    description: 'Registers the start of an agent run. Call at the beginning of every task. Auto-creates a stub task if task_id is not provided. Effect: inserts agent_runs row, sets task status to running. Returns: run_id, status. Requires agent_role, workspace_id.',
    annotations: { idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to associate (auto-creates stub if not found or not provided)' },
        agent_role: { type: 'string', description: 'One of the 24 canonical role slugs (e.g. software_engineer)' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project ID (defaults to workspace_id)' },
        worktree_path: { type: 'string', description: 'Optional git worktree path for code-writing roles' },
        pi_run_id: { type: 'string', description: 'Optional custom run ID for external tracking' },
      },
      required: ['agent_role', 'workspace_id'],
    },
  },
  {
    title: 'Heartbeat Agent Run',
    name: 'heartbeat_agent_run',
    description: 'Sends a liveness heartbeat for a running agent to prevent it being marked stale. Call every ~30 seconds during long tasks. Effect: updates heartbeat_at and optional progress fields. Returns: run_id, ok=true. Requires run_id, workspace_id.',
    annotations: { idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        current_step: { type: 'string', description: 'Optional current step description' },
        progress_pct: { type: 'number', description: 'Optional progress percentage (0–100)' },
      },
      required: ['run_id', 'workspace_id'],
    },
  },
  {
    title: 'Complete Agent Run',
    name: 'complete_agent_run',
    description: 'Marks an agent run as finished with optional summary and artifact paths. Effect: sets agent_runs.status=finished, records artifacts. Returns: run_id, status. Requires run_id, workspace_id.',
    annotations: { destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        output_summary: { type: 'string', description: 'Summary of what was accomplished' },
        artifact_paths: { type: 'string', description: 'Comma-separated artifact file paths changed or created' },
      },
      required: ['run_id', 'workspace_id'],
    },
  },
  {
    title: 'Block Agent Run',
    name: 'block_agent_run',
    description: 'Marks an agent run as blocked with a reason. Use when work cannot continue without human input or a dependency resolving. Effect: sets status=blocked, records reason. Returns: run_id, status, reason. Requires run_id, workspace_id, reason.',
    annotations: { destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        reason: { type: 'string', description: 'Why the run is blocked (will surface in workspace status)' },
      },
      required: ['run_id', 'workspace_id', 'reason'],
    },
  },
  {
    title: 'Build Chief-of-Staff Context',
    name: 'build_cos_context',
    description: 'Builds a Chief-of-Staff world-state snapshot: active tasks, running agents, blockers, recent events. Effect: read-only. Returns: context_markdown formatted for system prompt injection. Requires project_id, workspace_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Optional goal description (included in snapshot header)' },
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        max_tasks: { type: 'number', description: 'Max tasks to include (default 20)' },
        max_events: { type: 'number', description: 'Max events to include (default 10)' },
      },
      required: ['project_id', 'workspace_id'],
    },
  },
  {
    title: 'Get Workspace Status',
    name: 'get_workspace_status',
    description: 'Reads full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Effect: read-only. Returns: workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs array, blockers array. Requires workspace_id.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { workspace_id: { type: 'string', description: 'Workspace ID' } },
      required: ['workspace_id'],
    },
  },
  {
    title: 'Create Team Template',
    name: 'create_team_template',
    description: 'Creates a reusable team template with role slots and policy. Templates are global (not workspace-scoped). Effect: writes team_templates row. Returns: template object. Requires name and slots array.',
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
    description: 'Instantiates a team from a template and starts execution. Only chief_of_staff may invoke teams (enforced by canInvokeTeams check). Effect: creates team_instance row, spawns agents. Returns: team instance object. Requires template_id, workspace_id, purpose, caller_agent_id, caller_role.',
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
    description: 'Reads all team templates (global, not workspace-scoped). Effect: read-only. Returns: array of template objects with slots and policy.',
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
    description: 'Reads team instances in a workspace, optionally filtered by status_category. Effect: read-only. Returns: array of team instance objects. Requires workspace_id.',
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
    description: 'Creates a DB-backed agent profile for a workspace. Extends the 24 canonical AgentRole slugs with workspace-scoped specializations. Effect: writes agent_profiles row. Returns: profile object. Requires workspace_id, name, description.',
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
    description: 'Creates a canonical definition for a role: model, tools_allow/deny, executor_uri, system prompt. Effect: writes agent_definitions row. Returns: definition object. Requires role, display_name, description.',
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
    description: 'Reads the canonical definition for an AgentRole: model, tools, executor_uri, system_prompt. Effect: read-only. Returns: definition object or null. Requires role.',
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
    description: 'Updates fields on an existing agent definition. Effect: updates agent_definitions row in place. Returns: updated definition object. Requires role.',
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
    description: 'Reads all agent definitions, optionally filtered by stability tier. Effect: read-only. Returns: array of definition objects.',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        stability: { type: 'string', enum: ['stable', 'beta', 'experimental', 'deprecated'], description: 'Filter by stability tier' },
      },
    },
  },
]

/** Convenience lookup: tool name → schema */
export const TOOL_SCHEMA_MAP = new Map(TOOL_SCHEMAS.map(t => [t.name, t]))
